export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export interface AISearchChunk {
  id?: string;
  text?: string;
  content?: string;
  score?: number;
  metadata?: Record<string, JsonValue>;
  [key: string]: unknown;
}

const MAX_CONTEXT_CHUNK_LENGTH = 4000;

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

export function normalizeChunk(value: unknown): AISearchChunk {
  if (typeof value === "string") {
    return { text: value };
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { text: JSON.stringify(value) };
  }

  const rawObj = value as Record<string, unknown>;
  const metadata = typeof rawObj.metadata === "object" && rawObj.metadata !== null && !Array.isArray(rawObj.metadata)
    ? toJsonObject(rawObj.metadata as Record<string, unknown>)
    : undefined;

  const chunk: AISearchChunk = {
    id: typeof rawObj.id === "string" ? rawObj.id : undefined,
    text: typeof rawObj.text === "string" ? rawObj.text : undefined,
    content: typeof rawObj.content === "string" ? rawObj.content : undefined,
    score: typeof rawObj.score === "number" ? rawObj.score : undefined,
    metadata,
  };

  return chunk;
}

export function extractChunks(searchResults: unknown): AISearchChunk[] {
  if (typeof searchResults !== "object" || searchResults === null || Array.isArray(searchResults)) {
    return [];
  }

  const rawObj = searchResults as Record<string, unknown>;
  const candidates = [rawObj.chunks, rawObj.data, rawObj.results];
  const chunkArray = candidates.find(Array.isArray);

  return chunkArray ? chunkArray.map(normalizeChunk) : [];
}

export function sourceLabel(chunk: AISearchChunk, index: number): string {
  return (
    metadataString(chunk.metadata, "title") ||
    metadataString(chunk.metadata, "name") ||
    chunk.id ||
    `KB Chunk ${index + 1}`
  );
}

export function sourceMetadata(chunks: AISearchChunk[]): JsonObject[] {
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

export function formatContext(chunks: AISearchChunk[]): string {
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

/**
 * Validates that any Vitruvian-specific specifications mentioned in the LLM's response
 * are fully supported by the retrieved KB context.
 * Returns an object indicating grounding correctness and any missing/hallucinated claims.
 */
export function checkContextGrounding(
  chunks: AISearchChunk[],
  reply: string
): { grounded: boolean; missingClaims?: string[] } {
  const normalizedReply = reply.toLowerCase();
  
  // Combine all retrieved chunk text into one searchable context string
  const combinedContext = chunks
    .map((chunk) => {
      const text = chunk.text || chunk.content || "";
      const metadataText = chunk.metadata ? JSON.stringify(chunk.metadata) : "";
      return `${text} ${metadataText}`.toLowerCase();
    })
    .join(" ");

  // Enforce grounding on these strict, Vitruvian-specific keywords
  const vitruvianKeywords = [
    // Tiers
    "ember",
    "flame",
    "inferno",
    // Modes
    "old_school",
    "old school",
    "time under tension",
    "tut_beast",
    "tut beast",
    "pump",
    "eccentric_only",
    "eccentric only",
    "echo",
    // Hard specs
    "display multiplier",
    "weight_multiplier",
    "digital spotter",
    "slack limit",
    "strength ceiling",
    "0x50",
    "withoutresponse"
  ];

  const missingClaims: string[] = [];

  for (const keyword of vitruvianKeywords) {
    // If the reply mentions the keyword (using boundaries to avoid partial matches)
    const escKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const keywordRegex = new RegExp(`\\b${escKeyword}\\b`, "i");

    if (keywordRegex.test(normalizedReply)) {
      // Check if it exists in the retrieved context
      if (!combinedContext.includes(keyword)) {
        missingClaims.push(keyword);
      }
    }
  }

  if (missingClaims.length > 0) {
    return { grounded: false, missingClaims };
  }

  return { grounded: true };
}
