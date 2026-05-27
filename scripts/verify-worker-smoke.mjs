#!/usr/bin/env node
import process from "node:process";

const DEFAULT_BASE_URL = "http://127.0.0.1:8787";
const baseUrl = (process.env.PHOENIX_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
const runLiveCoach = process.env.PHOENIX_RUN_LIVE_COACH === "1";

function printHelp() {
  console.log(`Phoenix Worker smoke checks

Usage:
  npm run smoke:worker
  PHOENIX_BASE_URL=http://127.0.0.1:8787 npm run smoke:worker
  PHOENIX_RUN_LIVE_COACH=1 npm run smoke:worker

Environment:
  PHOENIX_BASE_URL        Worker base URL. Defaults to ${DEFAULT_BASE_URL}.
  PHOENIX_RUN_LIVE_COACH  Set to 1 to run a live /api/coach success request.

The default smoke run checks:
  - GET /api/health returns 200 JSON with ok: true.
  - Invalid JSON to POST /api/coach returns 400.
  - Missing message to POST /api/coach returns 400.
  - Unauthorized debug:true to POST /api/coach returns 403.

Live coach smoke requires configured Cloudflare secrets and AI Search access.`);
}

function preview(value) {
  return value.length > 300 ? `${value.slice(0, 300)}...` : value;
}

async function readJsonResponse(response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON response, got status ${response.status}: ${preview(text)}`);
  }
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await readJsonResponse(response);
  return { response, body };
}

function expectStatus(step, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${step} expected HTTP ${expected}, got ${actual}`);
  }
}

async function checkHealth() {
  const { response, body } = await requestJson("/api/health", { method: "GET" });

  expectStatus("health", response.status, 200);

  if (body?.ok !== true || body?.service !== "phoenix-ai-api") {
    throw new Error(`health returned unexpected body: ${JSON.stringify(body)}`);
  }

  console.log("PASS health");
}

async function checkInvalidJson() {
  const { response, body } = await requestJson("/api/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });

  expectStatus("invalid JSON", response.status, 400);

  if (body?.error !== "Bad Request") {
    throw new Error(`invalid JSON returned unexpected body: ${JSON.stringify(body)}`);
  }

  console.log("PASS invalid JSON");
}

async function checkMissingMessage() {
  const { response, body } = await requestJson("/api/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  expectStatus("missing message", response.status, 400);

  if (body?.error !== "Bad Request") {
    throw new Error(`missing message returned unexpected body: ${JSON.stringify(body)}`);
  }

  console.log("PASS missing message");
}

async function checkUnauthorizedDebug() {
  const { response, body } = await requestJson("/api/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Give me a safe warm-up.", debug: true }),
  });

  expectStatus("unauthorized debug", response.status, 403);

  if (body?.error !== "Forbidden") {
    throw new Error(`unauthorized debug returned unexpected body: ${JSON.stringify(body)}`);
  }

  console.log("PASS unauthorized debug");
}

async function checkLiveCoach() {
  if (!runLiveCoach) {
    console.log("SKIP live coach smoke: set PHOENIX_RUN_LIVE_COACH=1 to run it.");
    return;
  }

  const { response, body } = await requestJson("/api/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "What Vitruvian mode should I use for a safe hypertrophy set?" }),
  });

  expectStatus("live coach", response.status, 200);

  if (typeof body?.response !== "string" || body.response.length === 0) {
    throw new Error(`live coach returned unexpected body shape: ${JSON.stringify(body)}`);
  }

  console.log("PASS live coach");
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }

  console.log(`Running Phoenix Worker smoke checks against ${baseUrl}`);

  await checkHealth();
  await checkInvalidJson();
  await checkMissingMessage();
  await checkUnauthorizedDebug();
  await checkLiveCoach();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
