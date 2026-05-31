import { buildSystemPrompt } from "./prompts";
import { checkSafetyRedFlags } from "./safety";
import {
  JsonPrimitive,
  JsonValue,
  JsonObject,
  AISearchChunk,
  extractChunks,
  sourceMetadata,
  formatContext,
  checkContextGrounding,
} from "./retrieval";

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
  LOCAL_LLM_URL?: string;
  LOCAL_LLM_MODEL?: string;
  LOCAL_LLM_API_KEY?: string;
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

  // R7: Perform the physiological safety pre-filtering checks
  const safetyCheck = checkSafetyRedFlags(body.message);
  if (!safetyCheck.safe) {
    // Unsafe inputs trigger immediate graceful HTTP 200 bypass with empty sources array
    return jsonResponse(env, 200, {
      response: safetyCheck.responseOverride || "",
      sources: [],
    });
  }

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
        message: "Missing Azure OpenAI routing configuration required for MODEL_PROVIDER=azureopenai",
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
  } else if (provider === "local") {
    if (!env.LOCAL_LLM_URL) {
      return jsonResponse(env, 500, {
        error: "Configuration Error",
        message: "Missing 'LOCAL_LLM_URL' environment variable required for MODEL_PROVIDER=local",
      });
    }

    llmUrl = env.LOCAL_LLM_URL;
    modelName = env.LOCAL_LLM_MODEL || "local-model";
    if (env.LOCAL_LLM_API_KEY) {
      llmHeaders.Authorization = `Bearer ${env.LOCAL_LLM_API_KEY}`;
    }
    llmBody = {
      model: modelName,
      messages: llmMessages,
      temperature: 0.7,
      max_tokens: 2048,
    };
  } else {
    return jsonResponse(env, 400, {
      error: "Configuration Error",
      message: `Unsupported MODEL_PROVIDER specified: '${env.MODEL_PROVIDER}'. Must be 'workersai', 'azureopenai', or 'local'.`,
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
    const replyText = extractResponseText(data);
    let finalResponse = replyText;

    // R6: Enforce grounding post-check
    const groundingCheck = checkContextGrounding(chunks, replyText);
    if (!groundingCheck.grounded) {
      finalResponse +=
        "\n\n*Note: Some details in this response could not be verified by our official records. Please consult the official Vitruvian documentation for exact specifications.*";
    }

    // R5: Return safe top-level sources array
    const responsePayload: JsonObject = {
      response: finalResponse,
      sources: sourceMetadata(chunks),
    };

    if (debugAuthorized) {
      responsePayload.debug = {
        provider,
        model: modelName,
        chunkCount: chunks.length,
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
