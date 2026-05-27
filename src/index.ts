type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

type ChatRole = "user" | "assistant";

interface SearchMessage {
  role: "user";
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
  metadata?: Record<string, JsonValue>;
  [key: string]: unknown;
}

export interface Env {
  KB: {
    search(options: SearchOptions): Promise<unknown>;
  };

  CF_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
  MODEL_PROVIDER?: "workersai" | "azureopenai" | string;
  WORKERS_AI_MODEL?: string;
  AZURE_OPENAI_API_KEY?: string;
  AZURE_RESOURCE_NAME?: string;
  AZURE_DEPLOYMENT_NAME?: string;
  AZURE_API_VERSION?: string;
  ALLOWED_ORIGIN?: string;
  PHOENIX_DEBUG_ENABLED?: string;
  PHOENIX_DEBUG_TOKEN?: string;
  CF_API_TOKEN?: string;
}

interface ValidatedCoachRequest {
  message: string;
  userProfile: JsonObject;
  history: Array<{ role: ChatRole; content: string }>;
  debug: boolean;
}

type ValidationResult =
  | { ok: true; value: ValidatedCoachRequest }
  | { ok: false; status: 400; message: string };

const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_MESSAGE_LENGTH = 2000;
const MAX_USER_PROFILE_JSON_LENGTH = 4000;
const MAX_CONTEXT_CHUNK_LENGTH = 4000;
const MAX_ERROR_PREVIEW_LENGTH = 500;
const DEFAULT_WORKERS_AI_MODEL = "@cf/moonshotai/kimi-k2.6";
const DEFAULT_AI_GATEWAY_ID = "phoenix-ai";

function corsHeaders(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, cf-aig-gateway-id, X-Phoenix-Debug-Token",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(env: Env, status: number, payload: JsonValue): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(env),
    },
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (isPlainObject(value)) {
    return Object.values(value).every(isJsonValue);
  }

  return false;
}

function toJsonObject(value: Record<string, unknown>): JsonObject {
  const result: JsonObject = {};

  for (const [key, entry] of Object.entries(value)) {
    if (isJsonValue(entry)) {
      result[key] = entry;
    }
  }

  return result;
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

function metadataString(metadata: Record<string, JsonValue> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function normalizeChunk(value: unknown): AISearchChunk {
  if (typeof value === "string") {
    return { text: value };
  }

  if (!isPlainObject(value)) {
    return { text: JSON.stringify(value) };
  }

  const metadata = isPlainObject(value.metadata) ? toJsonObject(value.metadata) : undefined;
  const chunk: AISearchChunk = {
    id: typeof value.id === "string" ? value.id : undefined,
    text: typeof value.text === "string" ? value.text : undefined,
    content: typeof value.content === "string" ? value.content : undefined,
    score: typeof value.score === "number" ? value.score : undefined,
    metadata,
  };

  return chunk;
}

function extractChunks(searchResults: unknown): AISearchChunk[] {
  if (!isPlainObject(searchResults)) {
    return [];
  }

  const candidates = [searchResults.chunks, searchResults.data, searchResults.results];
  const chunkArray = candidates.find(Array.isArray);

  return chunkArray ? chunkArray.map(normalizeChunk) : [];
}

function sourceLabel(chunk: AISearchChunk, index: number): string {
  return (
    metadataString(chunk.metadata, "title") ||
    metadataString(chunk.metadata, "name") ||
    chunk.id ||
    `KB Chunk ${index + 1}`
  );
}

function sourceMetadata(chunks: AISearchChunk[]): JsonObject[] {
  return chunks.map((chunk, index) => {
    const source: JsonObject = {
      id: chunk.id || `chunk-${index + 1}`,
      source: sourceLabel(chunk, index),
    };

    if (typeof chunk.score === "number") {
      source.score = chunk.score;
    }

    return source;
  });
}

function formatContext(chunks: AISearchChunk[]): string {
  if (chunks.length === 0) {
    return "No relevant articles retrieved from the knowledge base.";
  }

  return chunks
    .map((chunk, index) => {
      const fallback = JSON.stringify(chunk);
      const text = truncate(chunk.text || chunk.content || fallback, MAX_CONTEXT_CHUNK_LENGTH);
      return `[Source: ${sourceLabel(chunk, index)}]\n${text}`;
    })
    .join("\n\n");
}

function formatProfile(userProfile: JsonObject): string {
  const profileLines = Object.entries(userProfile).map(([key, value]) => {
    const capitalizedKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1");
    const displayValue = typeof value === "object" ? JSON.stringify(value) : String(value);
    return `- **${capitalizedKey}**: ${displayValue}`;
  });

  return profileLines.length > 0
    ? profileLines.join("\n")
    : "No profile details provided (general athletic coaching).";
}

async function timingSafeEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length === rightBytes.length ? 0 : 1;

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }

  return mismatch === 0;
}

async function isTrustedDebugRequest(request: Request, env: Env): Promise<boolean> {
  if ((env.PHOENIX_DEBUG_ENABLED || "").toLowerCase() !== "true") {
    return false;
  }

  const configuredToken = (env.PHOENIX_DEBUG_TOKEN || "").trim();
  const providedToken = request.headers.get("X-Phoenix-Debug-Token") || "";

  if (!configuredToken || !providedToken) {
    return false;
  }

  return timingSafeEqual(providedToken, configuredToken);
}

async function parseCoachRequest(request: Request): Promise<ValidationResult> {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return { ok: false, status: 400, message: "Invalid JSON body payload" };
  }

  if (!isPlainObject(rawBody)) {
    return { ok: false, status: 400, message: "JSON body must be an object" };
  }

  if (typeof rawBody.message !== "string") {
    return { ok: false, status: 400, message: "Missing required string property: 'message'" };
  }

  const message = rawBody.message.trim();

  if (!message) {
    return { ok: false, status: 400, message: "Message must not be empty" };
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, status: 400, message: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer` };
  }

  const history: Array<{ role: ChatRole; content: string }> = [];

  if (rawBody.history !== undefined) {
    if (!Array.isArray(rawBody.history)) {
      return { ok: false, status: 400, message: "History must be an array when provided" };
    }

    if (rawBody.history.length > MAX_HISTORY_MESSAGES) {
      return { ok: false, status: 400, message: `History must include ${MAX_HISTORY_MESSAGES} messages or fewer` };
    }

    for (const [index, item] of rawBody.history.entries()) {
      if (!isPlainObject(item)) {
        return { ok: false, status: 400, message: `History item ${index + 1} must be an object` };
      }

      if (item.role !== "user" && item.role !== "assistant") {
        return { ok: false, status: 400, message: `History item ${index + 1} role must be 'user' or 'assistant'` };
      }

      if (typeof item.content !== "string") {
        return { ok: false, status: 400, message: `History item ${index + 1} content must be a string` };
      }

      const content = item.content.trim();

      if (!content) {
        return { ok: false, status: 400, message: `History item ${index + 1} content must not be empty` };
      }

      if (content.length > MAX_HISTORY_MESSAGE_LENGTH) {
        return {
          ok: false,
          status: 400,
          message: `History item ${index + 1} content must be ${MAX_HISTORY_MESSAGE_LENGTH} characters or fewer`,
        };
      }

      history.push({ role: item.role, content });
    }
  }

  let userProfile: JsonObject = {};

  if (rawBody.userProfile !== undefined) {
    if (!isPlainObject(rawBody.userProfile)) {
      return { ok: false, status: 400, message: "userProfile must be an object when provided" };
    }

    const profileString = JSON.stringify(rawBody.userProfile);

    if (profileString.length > MAX_USER_PROFILE_JSON_LENGTH) {
      return {
        ok: false,
        status: 400,
        message: `userProfile must serialize to ${MAX_USER_PROFILE_JSON_LENGTH} characters or fewer`,
      };
    }

    userProfile = toJsonObject(rawBody.userProfile);
  }

  if (rawBody.debug !== undefined && typeof rawBody.debug !== "boolean") {
    return { ok: false, status: 400, message: "debug must be a boolean when provided" };
  }

  return {
    ok: true,
    value: {
      message,
      userProfile,
      history,
      debug: rawBody.debug === true,
    },
  };
}

function buildSystemPrompt(profileString: string, contextString: string): string {
  return `You are "Phoenix Coach", a highly skilled, expert AI athletic and physiological coach designed for the Project Phoenix ecosystem. Project Phoenix is dedicated to keeping Vitruvian Trainer workout machines functional, smart, and fully utilized.

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
- **EXPLOSIVE**: >= 1.0 m/s (Power and speed work)
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
}

function extractResponseText(data: unknown): string {
  if (isPlainObject(data)) {
    const choices = data.choices;

    if (Array.isArray(choices)) {
      const firstChoice = choices[0];

      if (isPlainObject(firstChoice) && isPlainObject(firstChoice.message)) {
        const content = firstChoice.message.content;

        if (typeof content === "string") {
          return content;
        }
      }
    }

    if (isPlainObject(data.result) && typeof data.result.response === "string") {
      return data.result.response;
    }
  }

  return JSON.stringify(data);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(env),
      });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        return handleHealth(env);
      }

      if (url.pathname === "/api/coach" && request.method === "POST") {
        return await handleCoach(request, env);
      }

      return jsonResponse(env, 404, { error: "Not Found", path: url.pathname });
    } catch (error) {
      console.error("Worker Execution Error:", safeErrorMessage(error));
      return jsonResponse(env, 500, {
        error: "Internal Server Error",
        message: "The request could not be completed.",
      });
    }
  },
};

function handleHealth(env: Env): Response {
  return jsonResponse(env, 200, { ok: true, service: "phoenix-ai-api" });
}

async function handleCoach(request: Request, env: Env): Promise<Response> {
  const validation = await parseCoachRequest(request);

  if (!validation.ok) {
    return jsonResponse(env, validation.status, {
      error: "Bad Request",
      message: validation.message,
    });
  }

  const body = validation.value;
  const debugAuthorized = body.debug ? await isTrustedDebugRequest(request, env) : false;

  if (body.debug && !debugAuthorized) {
    return jsonResponse(env, 403, {
      error: "Forbidden",
      message: "Debug access is not enabled for this request.",
    });
  }

  let chunks: AISearchChunk[] = [];
  let retrievalError: string | null = null;

  try {
    const searchResults = await env.KB.search({
      messages: [{ role: "user", content: body.message }],
      ai_search_options: {
        retrieval: {
          retrieval_type: "hybrid",
          fusion_method: "rrf",
        },
      },
    });

    chunks = extractChunks(searchResults);
  } catch (error) {
    const message = safeErrorMessage(error);
    console.error("AI Search query failed:", message);
    retrievalError = truncate(message, MAX_ERROR_PREVIEW_LENGTH);
  }

  const contextString = formatContext(chunks);
  const profileString = formatProfile(body.userProfile);
  const systemPrompt = buildSystemPrompt(profileString, contextString);
  const historyMessages = body.history.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const llmMessages = [
    { role: "system", content: systemPrompt },
    ...historyMessages,
    { role: "user", content: body.message },
  ];

  const provider = (env.MODEL_PROVIDER || "workersai").toLowerCase().trim();
  let llmUrl = "";
  const llmHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };
  let llmBody: Record<string, unknown> = {};
  let modelName = "";

  if (provider === "workersai") {
    if (!env.CF_API_TOKEN) {
      return jsonResponse(env, 500, {
        error: "Configuration Error",
        message: "Missing 'CF_API_TOKEN' secret required to invoke Cloudflare Workers AI via AI Gateway",
      });
    }

    if (!env.CF_ACCOUNT_ID) {
      return jsonResponse(env, 500, {
        error: "Configuration Error",
        message: "Missing 'CF_ACCOUNT_ID' environment variable required for Workers AI routing",
      });
    }

    llmUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/v1/chat/completions`;
    llmHeaders.Authorization = `Bearer ${env.CF_API_TOKEN}`;
    llmHeaders["cf-aig-gateway-id"] = env.AI_GATEWAY_ID || DEFAULT_AI_GATEWAY_ID;
    modelName = env.WORKERS_AI_MODEL || DEFAULT_WORKERS_AI_MODEL;
    llmBody = {
      model: modelName,
      messages: llmMessages,
    };
  } else if (provider === "azureopenai") {
    if (!env.AZURE_OPENAI_API_KEY || !env.AZURE_RESOURCE_NAME || !env.AZURE_DEPLOYMENT_NAME || !env.CF_ACCOUNT_ID) {
      return jsonResponse(env, 500, {
        error: "Configuration Error",
        message:
          "Missing Azure OpenAI routing configuration required for MODEL_PROVIDER=azureopenai",
      });
    }

    const apiVersion = env.AZURE_API_VERSION || "2023-05-15";
    const gatewayId = env.AI_GATEWAY_ID || DEFAULT_AI_GATEWAY_ID;
    modelName = env.AZURE_DEPLOYMENT_NAME;
    llmUrl = `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${gatewayId}/azure-openai/${env.AZURE_RESOURCE_NAME}/${env.AZURE_DEPLOYMENT_NAME}/chat/completions?api-version=${apiVersion}`;
    llmHeaders["api-key"] = env.AZURE_OPENAI_API_KEY;
    llmBody = {
      messages: llmMessages,
    };
  } else {
    return jsonResponse(env, 400, {
      error: "Configuration Error",
      message: `Unsupported MODEL_PROVIDER specified: '${env.MODEL_PROVIDER}'. Must be 'workersai' or 'azureopenai'.`,
    });
  }

  try {
    const response = await fetch(llmUrl, {
      method: "POST",
      headers: llmHeaders,
      body: JSON.stringify(llmBody),
    });

    if (!response.ok) {
      const providerBody = await response.text();
      console.error("LLM Gateway Provider Error:", {
        provider,
        status: response.status,
        statusText: response.statusText,
        bodyPreview: truncate(providerBody, MAX_ERROR_PREVIEW_LENGTH),
      });

      const errorPayload: JsonObject = {
        error: "LLM Gateway Provider Error",
        status: response.status,
        message: "Provider request failed.",
      };

      if (debugAuthorized) {
        errorPayload.debug = {
          provider,
          model: modelName,
          upstreamStatus: response.status,
          upstreamStatusText: response.statusText,
        };
      }

      return jsonResponse(env, response.status, errorPayload);
    }

    const data: unknown = await response.json();
    const responsePayload: JsonObject = {
      response: extractResponseText(data),
    };

    if (debugAuthorized) {
      responsePayload.debug = {
        provider,
        model: modelName,
        chunkCount: chunks.length,
        sources: sourceMetadata(chunks),
        retrievalError,
      };
    }

    return jsonResponse(env, 200, responsePayload);
  } catch (error) {
    const message = safeErrorMessage(error);
    console.error("LLM Dispatch failed:", message);

    const errorPayload: JsonObject = {
      error: "LLM Provider Dispatch Failure",
      message: "Provider dispatch failed.",
    };

    if (debugAuthorized) {
      errorPayload.debug = {
        provider,
        model: modelName,
        dispatchError: truncate(message, MAX_ERROR_PREVIEW_LENGTH),
      };
    }

    return jsonResponse(env, 502, errorPayload);
  }
}
