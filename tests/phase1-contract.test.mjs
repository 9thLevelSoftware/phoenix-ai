import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const textDecoder = new TextDecoder("utf-8");
const root = new URL("../", import.meta.url);

function read(relativePath) {
  return textDecoder.decode(readFileSync(new URL(relativePath, root)));
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function assertContains(source, tokens, label) {
  for (const token of tokens) {
    assert.ok(source.includes(token), `${label} must contain ${token}`);
  }
}

test("route contract is preserved", () => {
  const source = read("src/index.ts");

  assertContains(source, ["/api/health", "/api/coach"], "src/index.ts");
  assert.match(source, /request\.method === "GET"/);
  assert.match(source, /request\.method === "POST"/);
  assert.match(source, /service: "phoenix-ai-api"/);
});

test("wrangler config keeps secrets out of vars and preserves AI Search binding", () => {
  const configSource = read("wrangler.jsonc");
  const config = readJson("wrangler.jsonc");

  assert.equal(config.name, "phoenix-ai-api");
  assert.equal(config.main, "src/index.ts");
  assert.equal(config.vars.MODEL_PROVIDER, "workersai");
  assert.equal(config.vars.PHOENIX_DEBUG_ENABLED, "false");
  assert.equal(config.vars.AI_GATEWAY_ID, "phoenix-ai");
  assert.equal(config.vars.WORKERS_AI_MODEL, "@cf/moonshotai/kimi-k2.6");
  assert.equal(config.ai_search[0].binding, "KB");
  assert.equal(config.ai_search[0].instance_name, "phoenix-vitruvian-kb");
  assert.equal(config.ai_search[0].remote, true);
  assert.equal(configSource.includes("AZURE_OPENAI_API_KEY"), false);
  assert.equal(configSource.includes("PHOENIX_DEBUG_TOKEN"), false);
  assert.equal(configSource.includes("CF_API_TOKEN"), false);
});

test("runtime source declares canonical provider and secret contract", () => {
  const source = read("src/index.ts");

  assertContains(
    source,
    [
      "CF_API_TOKEN",
      "AZURE_OPENAI_API_KEY",
      "PHOENIX_DEBUG_ENABLED",
      "PHOENIX_DEBUG_TOKEN",
      "MODEL_PROVIDER",
      "workersai",
      "azureopenai",
      "cf-aig-gateway-id",
    ],
    "src/index.ts",
  );
});

test("request validation bounds are present", () => {
  const source = read("src/index.ts");

  assertContains(
    source,
    [
      "MAX_MESSAGE_LENGTH",
      "MAX_HISTORY_MESSAGES",
      "MAX_HISTORY_MESSAGE_LENGTH",
      "MAX_USER_PROFILE_JSON_LENGTH",
      "JSON body must be an object",
      "History must include",
      "debug must be a boolean",
      "Bad Request",
    ],
    "src/index.ts",
  );
  assert.match(source, /item\.role !== "user" && item\.role !== "assistant"/);
});

test("debug output is trusted-only and does not expose raw prompt fields", () => {
  const source = read("src/index.ts");

  assertContains(
    source,
    [
      "isTrustedDebugRequest",
      "X-Phoenix-Debug-Token",
      "timingSafeEqual",
      "Debug access is not enabled for this request.",
      "chunkCount",
      "sources",
      "retrievalError",
    ],
    "src/index.ts",
  );
  assert.equal(source.includes("systemPrompt: systemPrompt"), false);
  assert.equal(source.includes("systemPrompt:"), false);
});

test("README documents the canonical local and deployment commands", () => {
  const readme = read("README.md");

  assertContains(
    readme,
    [
      "wrangler secret put CF_API_TOKEN",
      "wrangler secret put PHOENIX_DEBUG_TOKEN",
      "wrangler secret put AZURE_OPENAI_API_KEY",
      "MODEL_PROVIDER",
      "npm run typecheck",
      "npm run test:contracts",
      "npm run smoke:worker",
      "PHOENIX_RUN_LIVE_COACH",
    ],
    "README.md",
  );
});

test("generated Worker env snapshot includes Phase 1 bindings and secrets", () => {
  const generated = read("worker-configuration.d.ts");

  assertContains(
    generated,
    [
      "interface Env",
      "KB",
      "search(options",
      "CF_API_TOKEN",
      "PHOENIX_DEBUG_ENABLED",
      "PHOENIX_DEBUG_TOKEN",
      "AZURE_OPENAI_API_KEY",
    ],
    "worker-configuration.d.ts",
  );
});
