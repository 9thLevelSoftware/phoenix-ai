# phoenix-ai

The AI backend for the **Project Phoenix** ecosystem — the project that keeps
Vitruvian Trainer+ workout machines functional, smart, and fully utilized.

This repository ships `phoenix-ai-api`, a [Cloudflare Worker](https://workers.cloudflare.com/)
written in TypeScript that exposes a source-grounded, safety-aware AI coaching
endpoint called **Phoenix Coach**. Product facts come from a curated knowledge
base retrieved through [Cloudflare AI Search](https://developers.cloudflare.com/ai-search/),
and model calls are routed through [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/)
for observability and provider portability.

It also contains the fine-tuning assets (training script + ChatML datasets) used
later in the project for evaluating whether a locally fine-tuned model can
replace or augment the Workers AI baseline.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `src/index.ts` | Worker entry point: routes, request validation, provider dispatch, response shaping. |
| `src/retrieval.ts` | AI Search chunk parsing, context formatting, and Vitruvian-specific grounding check. |
| `src/prompts.ts` | The Phoenix Coach system prompt (training science, hardware modes, safety directives). |
| `src/safety.ts` | Pre-filter for unsafe inputs (acute pain/injury, extreme dieting, dangerous supplements). |
| `kb/` | Curated KB articles used by the AI Search binding (`phoenix-vitruvian-kb`): Vitruvian training modes, strength assessment & weight caps, membership features, hypertrophy principles, nutrition basics, safety boundaries. |
| `tests/` | Node test-runner suites — Phase 1 contract checks + Phase 2 retrieval & safety checks. |
| `scripts/verify-worker-smoke.mjs` | HTTP smoke checks against a running Worker (health, validation, unauthorized debug). |
| `scripts/normalize-generated-types.mjs` | Trims trailing whitespace from the generated `worker-configuration.d.ts`. |
| `scripts/start-local-server.sh` | Convenience launcher for a local model server. |
| `dataset/final/` | ChatML JSONL train / valid / test sets used by `train_phoenix.py`. Later-phase asset. |
| `train_phoenix.py` | Unsloth QLoRA fine-tuning script for Qwen3-4B-Instruct. Later-phase asset. |
| `.planning/` | Internal planning docs (project context, roadmap, phase plans). Not part of the runtime. |

## API Surface

The Worker exposes a small, intentional MVP API:

### `GET /api/health`

Returns `{ "ok": true, "service": "phoenix-ai-api" }` and a 200 status. Used
for liveness checks.

### `POST /api/coach`

Phoenix Coach. Request body:

```json
{
  "message": "What Vitruvian mode should I use for a safe hypertrophy set?",
  "userProfile": { "experienceLevel": "intermediate", "goal": "hypertrophy" },
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "debug": false
}
```

Validation limits (server-enforced):

- `message`: required, non-empty, ≤ 4000 chars
- `history`: optional, ≤ 12 messages, each ≤ 2000 chars, `role` ∈ `user` | `assistant`
- `userProfile`: optional object, serialized size ≤ 4000 chars
- `debug`: optional boolean — must also pass trusted-debug token check

Successful response (HTTP 200):

```json
{
  "response": "...",
  "sources": [
    { "id": "chunk-1", "source": "Vitruvian Training Modes", "score": 0.83 }
  ],
  "debug": { "provider": "workersai", "model": "...", "chunkCount": 4 }
}
```

`debug` is only included when both `PHOENIX_DEBUG_ENABLED=true` and the request
carries a valid `X-Phoenix-Debug-Token` header.

### Safety pre-filter

Before retrieval or model dispatch, `src/safety.ts` checks the user message for
safety red flags (acute pain / chest pain / injury symptoms, extreme dieting
targets < 1000 kcal, unsafe supplement requests). If a red flag is detected,
the Worker short-circuits with HTTP 200 and a safe refusal in `response`,
returning `sources: []`. This avoids surfacing harmful content even if the
underlying model would otherwise comply.

### Grounding post-check

After the model responds, `src/retrieval.ts#checkContextGrounding` verifies that
any Vitruvian-specific claims (training mode enums, weight caps, digital spotter
velocity, BLE protocol details, membership tiers, etc.) actually appear in the
retrieved KB context. If they do not, the response is appended with an explicit
uncertainty note.

## Install

```bash
npm install
```

## Environment Contract

Non-secret values live in `wrangler.jsonc` under `vars`.

| Name | Required for | Notes |
| --- | --- | --- |
| `CF_ACCOUNT_ID` | `workersai`, `azureopenai` | Cloudflare account that owns the Worker and AI Gateway. |
| `AI_GATEWAY_ID` | all providers | Defaults to `phoenix-ai`. |
| `MODEL_PROVIDER` | all providers | One of `workersai`, `azureopenai`, `local`. |
| `WORKERS_AI_MODEL` | `workersai` | Defaults to `@cf/moonshotai/kimi-k2.6`. |
| `AZURE_RESOURCE_NAME` | `azureopenai` | Azure OpenAI resource name, not a secret. |
| `AZURE_DEPLOYMENT_NAME` | `azureopenai` | Azure OpenAI deployment name. |
| `AZURE_API_VERSION` | `azureopenai` | Defaults to `2023-05-15`. |
| `LOCAL_LLM_URL` | `local` | e.g. `http://localhost:8080/v1/chat/completions` for a llama.cpp server. |
| `LOCAL_LLM_MODEL` | `local` | Defaults to `qwen2.5-7b-coaching-v4-Q4_K_M`. |
| `LOCAL_LLM_API_KEY` | `local` | Optional bearer token for the local server. |
| `ALLOWED_ORIGIN` | all providers | Use `*` only for local smoke testing. |
| `PHOENIX_DEBUG_ENABLED` | debug only | `true` outside production for trusted diagnostics. |

Secrets are never stored in `wrangler.jsonc`:

```bash
npx wrangler secret put CF_API_TOKEN            # required for MODEL_PROVIDER=workersai
npx wrangler secret put PHOENIX_DEBUG_TOKEN     # required only when debug responses are enabled
npx wrangler secret put AZURE_OPENAI_API_KEY    # required only for MODEL_PROVIDER=azureopenai
```

For local development, copy `.dev.vars.example` to `.dev.vars` and fill in
local values. `.dev.vars` is git-ignored.

## Local Development

```bash
npm run dev          # wrangler dev --local  (no Cloudflare login required)
npm run dev:remote   # wrangler dev          (real AI Search + AI Gateway)
```

`npm run dev` starts the Worker against the local Cloudflare runtime and is
sufficient for Phase 1 health, validation, and debug-gating smoke checks. It
does not require a Cloudflare login.

The Worker expects an AI Search instance binding in `wrangler.jsonc`:

- binding: `KB`
- instance: `phoenix-vitruvian-kb`
- remote local development: `remote: true`

For live AI Search / model checks, use `npm run dev:remote` (requires
`npx wrangler login`) or a deployed Worker URL.

## Verification

```bash
npm run types:worker  # regenerate worker-configuration.d.ts from wrangler.jsonc
npm run typecheck     # tsc --noEmit
npm run test:contracts   # Phase 1: request validation + provider config
npm run test:safety      # Phase 2: retrieval parsing, grounding, safety pre-filter
```

`npm run types:worker` runs `wrangler types` and then
`scripts/normalize-generated-types.mjs` to strip trailing whitespace from the
generated declaration file. The project uses Wrangler 4.x so the `ai_search`
binding is recognized as `KB: AiSearchInstance` during local development and
type generation.

`npm run test:contracts` and `npm run test:safety` use Node's built-in test
runner (`node --test`). Neither calls Cloudflare services — they exercise the
local TypeScript modules directly via `tsx`-style import.

## Smoke Testing

Start a local Worker first:

```bash
npm run dev
```

Then run the smoke checks from another terminal:

```bash
npm run smoke:worker
```

The smoke script targets `http://127.0.0.1:8787` by default. Override with
`PHOENIX_BASE_URL` when testing a deployed or remote `wrangler dev` target:

```bash
PHOENIX_BASE_URL="https://example.workers.dev" npm run smoke:worker
```

By default, smoke checks avoid live model calls (health, invalid JSON,
missing message, unauthorized debug). To run the live `/api/coach` success path,
configure the required Cloudflare secrets, use `npm run dev:remote` or a
deployed Worker URL so the `KB` AI Search binding is reachable, then opt in
explicitly:

```bash
PHOENIX_RUN_LIVE_COACH="1" npm run smoke:worker
```

## Debug Access

Setting `debug: true` in the request body is not sufficient on its own. The
Worker requires both:

- `PHOENIX_DEBUG_ENABLED=true` in the Worker's environment
- An `X-Phoenix-Debug-Token` request header that matches `PHOENIX_DEBUG_TOKEN`
  (compared in constant time)

When both conditions hold, successful responses include a `debug` object with
the active provider, model name, retrieval chunk count, and any retrieval
errors. Debug responses must never expose raw prompts, secrets, or full
provider payloads.

## Fine-Tuning (later phase)

`train_phoenix.py` is an Unsloth QLoRA fine-tuning script for
`Qwen3-4B-Instruct`, designed for a 12–16 GB GPU. It consumes the ChatML JSONL
files in `dataset/final/` and emits a checkpoint that can be merged and
quantized for local inference via the `MODEL_PROVIDER=local` route.

Fine-tuning is intentionally deferred until the RAG + grounding + safety gates
shipped in the Worker have been measured end-to-end and shown to be insufficient
for the coaching quality bar. See `.planning/ROADMAP.md` for the planned eval
suite and escalation decision.

## Deployment

Set required non-secret vars in `wrangler.jsonc`, store secrets with Wrangler,
then deploy:

```bash
npm run deploy
```

Before exposing the endpoint to real users, replace wildcard CORS with the
production origin and add the planned auth, rate-limit, and observability
gates (see `.planning/ROADMAP.md` Phase 4).