interface SearchMessage {
  role: string;
  content: string;
}

interface SearchOptions {
  messages: SearchMessage[];
  ai_search_options?: {
    retrieval?: {
      retrieval_type?: "vector" | "keyword" | "hybrid";
      fusion_method?: "rrf" | "max";
    };
  };
}

interface AISearchChunk {
  id?: string;
  text?: string;
  content?: string;
  score?: number;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface Env {
  // AI Search binding
  KB: {
    search(options: SearchOptions): Promise<any>;
  };

  // Environment variables/secrets
  CF_ACCOUNT_ID: string;
  AI_GATEWAY_ID: string;
  MODEL_PROVIDER: "workersai" | "azureopenai" | string;
  WORKERS_AI_MODEL: string;
  AZURE_OPENAI_API_KEY: string;
  AZURE_RESOURCE_NAME: string;
  AZURE_DEPLOYMENT_NAME: string;
  AZURE_API_VERSION: string;
  ALLOWED_ORIGIN: string;

  // Cloudflare API Token for routing Workers AI requests through AI Gateway
  CF_API_TOKEN?: string;
}

interface CoachRequest {
  message: string;
  userProfile?: Record<string, any>;
  history?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  debug?: boolean;
}

// Robust CORS headers generator
function corsHeaders(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, cf-aig-gateway-id",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // 1. Handle CORS Preflight checks
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(env),
      });
    }

    const url = new URL(request.url);

    try {
      // 2. GET /api/health
      if (url.pathname === "/api/health" && request.method === "GET") {
        return handleHealth(request, env);
      }

      // 3. POST /api/coach
      if (url.pathname === "/api/coach" && request.method === "POST") {
        return await handleCoach(request, env);
      }

      // 4. Default Not Found
      return new Response(JSON.stringify({ error: "Not Found", path: url.pathname }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(env),
        },
      });
    } catch (err: any) {
      console.error("Worker Execution Error:", err);
      return new Response(JSON.stringify({ 
        error: "Internal Server Error", 
        message: err.message || String(err) 
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(env),
        },
      });
    }
  }
};

// GET /api/health implementation
function handleHealth(request: Request, env: Env): Response {
  return new Response(JSON.stringify({ ok: true, service: "phoenix-ai-api" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(env),
    },
  });
}

// POST /api/coach implementation
async function handleCoach(request: Request, env: Env): Promise<Response> {
  let body: CoachRequest;
  
  try {
    body = (await request.json()) as CoachRequest;
  } catch (err) {
    return new Response(JSON.stringify({ error: "Bad Request", message: "Invalid JSON body payload" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(env),
      },
    });
  }

  // Basic Validation
  if (!body || !body.message) {
    return new Response(JSON.stringify({ error: "Bad Request", message: "Missing required string property: 'message'" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(env),
      },
    });
  }

  // 1. Query Knowledge Base using AI Search
  let searchResults: any = null;
  let chunks: AISearchChunk[] = [];
  let retrievalError: string | null = null;

  try {
    searchResults = await env.KB.search({
      messages: [{ role: "user", content: body.message }],
      ai_search_options: {
        retrieval: {
          retrieval_type: "hybrid",
          fusion_method: "rrf"
        }
      }
    });

    if (searchResults && typeof searchResults === "object") {
      if (Array.isArray(searchResults.chunks)) {
        chunks = searchResults.chunks;
      } else if (Array.isArray(searchResults.data)) {
        chunks = searchResults.data;
      } else if (Array.isArray(searchResults.results)) {
        chunks = searchResults.results;
      }
    }
  } catch (e: any) {
    console.error("AI Search query failed:", e);
    retrievalError = e.message || String(e);
  }

  // 2. Format Context String from chunks
  const contextString = chunks.length > 0
    ? chunks.map((chunk, idx) => {
        const text = chunk.text || chunk.content || (typeof chunk === 'string' ? chunk : JSON.stringify(chunk));
        const source = chunk.metadata?.title || chunk.metadata?.name || chunk.id || `KB Chunk ${idx + 1}`;
        return `[Source: ${source}]\n${text}`;
      }).join("\n\n")
    : "No relevant articles retrieved from the knowledge base.";

  // 3. Format User Profile into readable lines
  const userProfile = body.userProfile || {};
  const profileLines = Object.entries(userProfile)
    .map(([key, val]) => {
      const capitalizedKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
      const displayVal = typeof val === 'object' ? JSON.stringify(val) : val;
      return `- **${capitalizedKey}**: ${displayVal}`;
    });
  const profileString = profileLines.length > 0
    ? profileLines.join("\n")
    : "No profile details provided (general athletic coaching).";

  // 4. Construct System Prompt
  const systemPrompt = `You are "Phoenix Coach", a highly skilled, expert AI athletic and physiological coach designed for the Project Phoenix ecosystem. Project Phoenix is dedicated to keeping Vitruvian Trainer workout machines functional, smart, and fully utilized.

You are communicating with a user training on a Vitruvian Trainer machine. You must act as a knowledgeable, motivating, and safety-conscious personal trainer, leveraging exercise science, precise nutrition, and specific hardware knowledge.

### YOUR CHARACTER & PRINCIPLES:
1. **Tone**: Direct, empowering, professional, encouraging, scientific yet accessible.
2. **Focus**: Achieve optimal athletic performance and hypertrophy while maintaining strict physiological safety.

### ESSENTIAL TRAINING KNOWLEDGE:

#### 1. HYPERTROPHY PRINCIPLES (Core Pillars)
- **Mechanical Tension**: This is the primary driver of muscle growth. Maximize force generation through active loading and appropriate intensity.
- **Proximity to Failure (RPE / RIR)**: Working sets must be high effort. Guide the user to target an RPE (Rating of Perceived Exertion) of **7 to 10** (0 to 3 Reps in Reserve - RIR) to trigger growth. Explain that training too far from failure yields sub-optimal muscle recruitment.
- **Progressive Overload**: Systematically increase weight (per-cable load), repetition counts, or eccentric duration to drive adaptation.

#### 2. VITRUVIAN HARDWARE MODES & ENUMS
Always map workouts and user goals to one or more of the standard Vitruvian physical motor modes:
- **Old School (\`OLD_SCHOOL\`)**: Constant resistance throughout the concentric and eccentric phases. Perfect for traditional, barbell-equivalent exercises.
- **Time Under Tension (\`TUT\`)**: Constant tracking tension that actively resists the concentric phase and applies a smooth, slower load during the eccentric phase. Great for hypertrophy.
- **TUT Beast (\`TUT_BEAST\`)**: High-tension, aggressive TUT mode with rapid eccentric overload ramp-ups. For advanced athletes.
- **Pump (\`PUMP\`)**: Velocity-dependent accommodating resistance. The faster the movement, the heavier the load. Ideal for explosive power or high-repetition muscle-pumping sets.
- **Eccentric Only (\`ECCENTRIC_ONLY\`)**: Unloaded concentric phase (tracking at 8 lbs), with active target weight engaging only during the eccentric lowering phase.
- **Echo (\`ECHO\`)**: Isokinetic speed-locked mode that matches user force output 1:1. Excellent for calibration and maximum-strength assessment tests.

#### 3. WEIGHT CONVENTION & CALIBRATION
- **Database Weight Representation**: All weights in the Project Phoenix database and local mobile SQLite models are stored strictly **per-cable** (0 to 220 kg).
- **User Display weight**: All weights shown to the user on the web portal or mobile screen are multiplied by **2** (\`WEIGHT_MULTIPLIER = 2\`) for standard barbell total parity.
- *Ambiguity Rule*: If the user mentions a weight (e.g., "I did 100 kg on the bench"), clarify if they mean 100 kg total display weight (which is 50 kg per cable in the database) or if they are referencing single-cable limits.

#### 4. BIOMECHANICS & VELOCITY ZONES
Use these precise velocity boundaries when analyzing set telemetry or explaining performance:
- **EXPLOSIVE**: ≥ 1.0 m/s (Power and speed work)
- **FAST**: 0.75 m/s to 1.0 m/s
- **MODERATE**: 0.50 m/s to 0.75 m/s
- **SLOW**: 0.25 m/s to 0.50 m/s
- **GRIND**: < 0.25 m/s (Near-failure high motor unit recruitment)

#### 5. HARDWARE SAFETY BOUNDARIES & CALIBRATION
- **Digital Spotter**: The trainer includes an active computer spotter. If concentric speed drops below **0.15 m/s**, or if a sudden concentric drop is registered, the motors immediately unload to the baseline **8 lbs** tracking tension.
- **Digital Slack Limit**: The absolute minimum tension the machine can provide is **8 lbs (approx. 3.6 kg) per cable**. It cannot go lower while active.
- **Assessment Requirement**: Before doing heavy routines, users must calibrate their **Strength Ceiling** via an assessment test (e.g., in ECHO mode) to establish a safe ceiling. High-intensity loads are capped at 90% of this assessed ceiling.
- **BLE Connection Stability**: Under the hood, Project Phoenix mobile BLE protocols require that the heartbeat uses the valid \`0x50\` Stop Packet command (command \`0x00\` is invalid). For stability after idle periods, the device relies on \`WriteType.WithoutResponse\`, even if not advertised.

---

### CURRENT USER PROFILE:
${profileString}

### RETRIEVED KNOWLEDGE BASE CONTEXT:
${contextString}

---

### INSTRUCTIONS FOR YOUR RESPONSE:
- Formulate a tailored, actionable response based on the user's message, their training profile, and the retrieved knowledge base articles.
- Incorporate appropriate exercise science advice, suggest the best Vitruvian Mode to use, and highlight any relevant safety protocols or physical boundaries.
- Keep your instructions highly practical, supportive, and safety-conscious. Do not mention database schemas or specific code internals unless the user asks you a technical development question.`;

  // 5. Compile History & Messages for LLM Payload
  const historyMessages = (body.history || []).map(msg => ({
    role: msg.role === "assistant" ? "assistant" : "user",
    content: msg.content
  }));

  const llmMessages = [
    { role: "system", content: systemPrompt },
    ...historyMessages,
    { role: "user", content: body.message }
  ];

  // 6. Execute Provider Request
  const provider = (env.MODEL_PROVIDER || "workersai").toLowerCase().trim();
  let llmUrl = "";
  const llmHeaders: Record<string, string> = {
    "Content-Type": "application/json"
  };
  let llmBody: Record<string, any> = {};

  if (provider === "workersai") {
    // Check for API credentials
    if (!env.CF_API_TOKEN) {
      return new Response(JSON.stringify({ 
        error: "Configuration Error", 
        message: "Missing 'CF_API_TOKEN' secret required to invoke Cloudflare Workers AI via AI Gateway" 
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(env),
        },
      });
    }

    if (!env.CF_ACCOUNT_ID) {
      return new Response(JSON.stringify({ 
        error: "Configuration Error", 
        message: "Missing 'CF_ACCOUNT_ID' environment variable required for Workers AI routing" 
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(env),
        },
      });
    }

    // Call Cloudflare REST API with cf-aig-gateway-id for AI Gateway proxying
    llmUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/v1/chat/completions`;
    llmHeaders["Authorization"] = `Bearer ${env.CF_API_TOKEN}`;
    llmHeaders["cf-aig-gateway-id"] = env.AI_GATEWAY_ID || "phoenix-ai";
    
    llmBody = {
      model: env.WORKERS_AI_MODEL || "@cf/moonshotai/kimi-k2.6",
      messages: llmMessages
    };
  } else if (provider === "azureopenai") {
    if (!env.AZURE_OPENAI_API_KEY || !env.AZURE_RESOURCE_NAME || !env.AZURE_DEPLOYMENT_NAME) {
      return new Response(JSON.stringify({ 
        error: "Configuration Error", 
        message: "Missing 'AZURE_OPENAI_API_KEY', 'AZURE_RESOURCE_NAME', or 'AZURE_DEPLOYMENT_NAME' required for Azure OpenAI routing" 
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(env),
        },
      });
    }

    // Call Azure OpenAI via Cloudflare AI Gateway proxy
    const apiVersion = env.AZURE_API_VERSION || "2023-05-15";
    llmUrl = `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/azure-openai/${env.AZURE_RESOURCE_NAME}/${env.AZURE_DEPLOYMENT_NAME}/chat/completions?api-version=${apiVersion}`;
    llmHeaders["api-key"] = env.AZURE_OPENAI_API_KEY;

    llmBody = {
      messages: llmMessages
    };
  } else {
    return new Response(JSON.stringify({ 
      error: "Configuration Error", 
      message: `Unsupported MODEL_PROVIDER specified: '${env.MODEL_PROVIDER}'. Must be 'workersai' or 'azureopenai'.` 
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(env),
      },
    });
  }

  // Dispatch network call to the LLM Gateway
  try {
    const response = await fetch(llmUrl, {
      method: "POST",
      headers: llmHeaders,
      body: JSON.stringify(llmBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({
        error: "LLM Gateway Provider Error",
        status: response.status,
        message: errText
      }), {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(env),
        },
      });
    }

    const data: any = await response.json();
    // Support standard OpenAI output format or standard Workers AI fallback
    const responseText = data?.choices?.[0]?.message?.content || 
                         data?.result?.response || 
                         JSON.stringify(data);

    // Prepare response payload
    const responsePayload: Record<string, any> = {
      response: responseText
    };

    // Include debug information if requested
    if (body.debug) {
      responsePayload.debug = {
        provider: env.MODEL_PROVIDER,
        model: provider === "workersai" ? (env.WORKERS_AI_MODEL || "@cf/moonshotai/kimi-k2.6") : env.AZURE_DEPLOYMENT_NAME,
        chunks: chunks,
        retrievalError: retrievalError,
        systemPrompt: systemPrompt
      };
    }

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(env),
      },
    });
  } catch (err: any) {
    console.error("LLM Dispatch failed:", err);
    return new Response(JSON.stringify({
      error: "LLM Provider Dispatch Failure",
      message: err.message || String(err)
    }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(env),
      },
    });
  }
}
