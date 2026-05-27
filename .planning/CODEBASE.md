---
map_schema_version: "2.0"
generated_at: "2026-05-27T21:52:00Z"
analyzed_commit: "566d935560a627a12014dbb2eb29874dfd5611c8"
source_file_count: 18
source_fingerprint: "1558ec894adc0e56ec7e2f352ffac1e98065db09a495822c3be13f25b874d97d"
source_fingerprint_kind: "sha256-path-size-mtime"
scope: "project-root"
---

# Codebase Map - phoenix-ai

## Summary
`phoenix-ai` is a small TypeScript Cloudflare Worker project for a Phoenix Coach API. The Worker exposes a health endpoint and a coaching endpoint, retrieves knowledge through a Cloudflare AI Search binding, and dispatches model calls through Cloudflare AI Gateway to either Workers AI or Azure OpenAI. The repo also contains local markdown knowledge-base seed files, JSONL supervised fine-tuning datasets, and a Python Unsloth QLoRA training script.

The current code compiles with `npm run typecheck`. The highest map risks are operational/security hardening issues rather than compile failures: permissive CORS, debug output that can expose full system prompts, `any`-heavy boundary types, empty Azure/API-token placeholders in non-secret vars, and an outdated `wrangler` dev toolchain with known transitive vulnerabilities.

## Architecture

### File Tree
```text
.
├── README.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── wrangler.jsonc
├── worker-configuration.d.ts
├── src/
│   └── index.ts
├── kb/
│   ├── nutrition/nutrition-basics.md
│   ├── programming/hypertrophy-principles.md
│   ├── safety/safety-boundaries.md
│   └── vitruvian/
│       ├── membership-features.md
│       ├── strength-assessment-weight-cap.md
│       └── training-modes.md
├── dataset/final/
│   ├── train.jsonl
│   ├── valid.jsonl
│   └── test.jsonl
└── train_phoenix.py
```

### Language Distribution
| Extension | File Count | Notes |
|-----------|------------|-------|
| `.md` | 7 | README plus six KB documents |
| `.jsonl` | 3 | Fine-tuning train/valid/test datasets |
| `.json` | 2 | `package.json`, `package-lock.json` |
| `.ts` | 2 | Worker implementation and generated Env type stub |
| `.jsonc` | 1 | Wrangler config |
| `.py` | 1 | Unsloth QLoRA training script |
| `.gitignore` | 1 | Ignore rules |

### Entry Points
| Type | Path | Evidence |
|------|------|----------|
| Worker module | `src/index.ts` | `package.json` `main` and `wrangler.jsonc` `main` |
| Cloudflare config | `wrangler.jsonc` | Worker name, compatibility date, AI Search binding, vars |
| Fine-tuning script | `train_phoenix.py` | CLI arguments and direct training execution |

### Module Structure
Flat single-package Worker project. Runtime code lives in one `src/index.ts` file. Knowledge documents live under topic folders in `kb/`. Fine-tuning data is separated under `dataset/final/`.

## Frameworks
| Layer | Technology | Evidence |
|-------|------------|----------|
| Runtime | Cloudflare Workers | `wrangler.jsonc`, `@cloudflare/workers-types` |
| Language | TypeScript | `tsconfig.json`, `src/index.ts` |
| Worker tooling | Wrangler 3.114.17 installed | `npm list --depth=0` |
| AI retrieval | Cloudflare AI Search binding | `wrangler.jsonc` `ai_search`, `env.KB.search()` |
| Model routing | Cloudflare AI Gateway | `cf-aig-gateway-id`, Workers AI and Azure gateway URLs in `src/index.ts` |
| Fine-tuning | Unsloth, Transformers, TRL, PyTorch | Imports and comments in `train_phoenix.py` |
| Test framework | _No data available_ | No JS/TS test dependency or test directory detected |

## Functionality Inventory

### Worker API
- `GET /api/health` returns `{ ok: true, service: "phoenix-ai-api" }`.
- `POST /api/coach` parses JSON, requires `message`, searches AI Search using hybrid/RRF retrieval, builds a long Phoenix Coach system prompt, appends optional history, dispatches to the configured model provider, and returns a JSON object with `response`.
- `OPTIONS` requests are handled with CORS preflight headers.
- All other paths return JSON 404.

### Retrieval and Prompting
- AI Search query path: `env.KB.search({ messages: [{ role: "user", content: body.message }], ai_search_options: { retrieval: { retrieval_type: "hybrid", fusion_method: "rrf" } } })`.
- Result parsing accepts `chunks`, `data`, or `results` arrays.
- Context formatting accepts `chunk.text`, `chunk.content`, string chunks, or JSON fallback.
- The system prompt embeds Vitruvian modes, weight conventions, velocity zones, safety boundaries, user profile details, and retrieved KB context.

### Provider Dispatch
- `MODEL_PROVIDER=workersai` calls `https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/v1/chat/completions` with `Authorization: Bearer {CF_API_TOKEN}` and `cf-aig-gateway-id`.
- `MODEL_PROVIDER=azureopenai` calls Cloudflare AI Gateway's Azure OpenAI provider-native route using `AZURE_OPENAI_API_KEY`.
- Unsupported provider values return a 400 configuration error.

### Knowledge Base Seed Documents
- `kb/vitruvian/training-modes.md` defines Old School, TUT, TUT Beast, Pump, Eccentric Only, and Echo.
- `kb/vitruvian/strength-assessment-weight-cap.md` defines digital weight boundaries, per-cable storage, display multiplier, and strength assessment rules.
- `kb/vitruvian/membership-features.md` summarizes Free, Ember, Flame, and Inferno membership tiers for the Phoenix ecosystem.
- `kb/safety/safety-boundaries.md` defines digital spotting, equipment setup, and environmental safety.
- `kb/programming/hypertrophy-principles.md` defines hypertrophy principles, RPE/RIR, volume, frequency, and rest.
- `kb/nutrition/nutrition-basics.md` defines calorie and macro basics.

### Fine-Tuning Assets
- `dataset/final/train.jsonl`: 3,261 ChatML training examples.
- `dataset/final/valid.jsonl`: 537 validation examples.
- `dataset/final/test.jsonl`: 218 test examples.
- `train_phoenix.py` loads `unsloth/Qwen3-4B-Instruct-2507-unsloth-bnb-4bit`, attaches QLoRA adapters, formats ChatML with the tokenizer chat template, trains via `SFTTrainer`, saves LoRA adapters, and runs a JSON sanity generation.

## Module Ownership
| Area | Files | Owner Domain | Notes |
|------|-------|--------------|-------|
| Worker API/runtime | `src/index.ts`, `wrangler.jsonc`, `tsconfig.json`, `worker-configuration.d.ts` | Backend/API + Cloudflare operations | Highest priority for Phase 1 hardening |
| Knowledge base | `kb/**/*.md` | Product/domain content + safety review | Source grounding depends on these files being accurate and uploaded/indexed |
| Fine-tuning data | `dataset/final/*.jsonl` | AI/ML eval and training | Later-phase asset; not required for MVP RAG deployment |
| Training script | `train_phoenix.py` | AI/ML operations | Consumer-GPU QLoRA path; separate from Worker runtime |
| Planning artifacts | `.planning/**` | Legion workflow | Generated workflow state, not runtime application code |

## Dependency Graph

### Runtime Flow
```text
HTTP request
  -> src/index.ts fetch handler
  -> corsHeaders()
  -> handleHealth() or handleCoach()
  -> env.KB.search()
  -> system prompt + history assembly
  -> Workers AI or Azure OpenAI via Cloudflare AI Gateway
  -> JSON response
```

### File/Config Dependencies
| Consumer | Depends On | Purpose |
|----------|------------|---------|
| `src/index.ts` | `Env.KB` binding | AI Search retrieval |
| `src/index.ts` | `CF_ACCOUNT_ID`, `AI_GATEWAY_ID`, `MODEL_PROVIDER`, `WORKERS_AI_MODEL`, Azure vars, `ALLOWED_ORIGIN`, `CF_API_TOKEN` | Provider routing and CORS |
| `wrangler.jsonc` | Cloudflare account resources | Deploys Worker and binds AI Search |
| `worker-configuration.d.ts` | Wrangler type generation | Env type snapshot; currently does not include `CF_API_TOKEN` |
| `train_phoenix.py` | `dataset/final/train.jsonl`, `dataset/final/valid.jsonl` | Fine-tuning input |

### High Fan-In Files
- `src/index.ts`: all runtime behavior is concentrated in one file.
- `wrangler.jsonc`: deployment, bindings, model route defaults, and public CORS default are centralized here.

## API Surface
| Method | Path | Handler | Request | Response | Risks |
|--------|------|---------|---------|----------|-------|
| `OPTIONS` | `*` | fetch preflight | None | 204 with CORS headers | CORS currently defaults to `*` |
| `GET` | `/api/health` | `handleHealth` | None | `{ ok, service }` | Low |
| `POST` | `/api/coach` | `handleCoach` | JSON body with `message`, optional `userProfile`, `history`, `debug` | `{ response }` plus optional `debug` | Debug leaks prompt/chunks; weak validation; no auth/rate limit |
| any | other path | fetch fallback | Any | 404 JSON with path | Low |

## Config/Environment

### Wrangler
- Worker name: `phoenix-ai-api`
- Main: `src/index.ts`
- Compatibility date: `2026-05-01`
- AI Search binding: `KB`
- AI Search instance: `phoenix-vitruvian-kb`
- AI Search remote dev: `true`

### Vars and Secrets
| Name | Location | Sensitivity | Notes |
|------|----------|-------------|-------|
| `CF_ACCOUNT_ID` | `wrangler.jsonc` vars | Non-secret but account identifier | Empty placeholder currently |
| `AI_GATEWAY_ID` | `wrangler.jsonc` vars | Non-secret | Defaults to `phoenix-ai` |
| `MODEL_PROVIDER` | `wrangler.jsonc` vars | Non-secret | Defaults to `workersai`; code also supports `azureopenai` |
| `WORKERS_AI_MODEL` | `wrangler.jsonc` vars | Non-secret | Defaults to `@cf/moonshotai/kimi-k2.6` |
| `AZURE_OPENAI_API_KEY` | `wrangler.jsonc` vars | Secret | Currently configured as an empty var; should be a Wrangler secret if used |
| `AZURE_RESOURCE_NAME` | `wrangler.jsonc` vars | Non-secret-ish account/resource identifier | Empty placeholder |
| `AZURE_DEPLOYMENT_NAME` | `wrangler.jsonc` vars | Non-secret | Empty placeholder |
| `AZURE_API_VERSION` | `wrangler.jsonc` vars | Non-secret | Defaults to `2023-05-15` |
| `ALLOWED_ORIGIN` | `wrangler.jsonc` vars | Non-secret | Currently `*` |
| `CF_API_TOKEN` | Worker secret expected by code | Secret | Not present in `worker-configuration.d.ts`; canonical naming needs alignment |

### Ignored Secret Files
`.gitignore` excludes `.dev.vars`, `.env`, `*.env`, `.env.*`, and `.dev.vars.local`.

## Test Coverage
| Area | Status |
|------|--------|
| TypeScript compile | `npm run typecheck` passed during map generation |
| Unit tests | _No data available_ |
| API integration tests | _No data available_ |
| Eval suite | Fine-tuning test dataset exists, but no Worker eval harness detected |
| Cloudflare local/dev deploy verification | _No data available_ |

### Critical Untested Files
| File | Why Critical | Current Coverage |
|------|--------------|------------------|
| `src/index.ts` | Entire production API, retrieval, prompt, provider routing, and debug behavior | Typecheck only |
| `wrangler.jsonc` | Deployment binding and model provider config | No automated validation beyond Wrangler schema availability |
| `kb/**/*.md` | Source-grounding content for coaching behavior | No freshness/source validation detected |
| `train_phoenix.py` | Fine-tuning path and JSON sanity check | Not run during map; external ML deps not declared in repo |

## Risks

### Security and Privacy
- HIGH: `/api/coach` accepts `debug: true` from the request body and returns `systemPrompt`, retrieved chunks, provider/model, and retrieval errors. This can expose prompt internals and user/profile context.
- HIGH: No auth, rate limiting, or trusted user identity boundary is present in the Worker.
- MEDIUM: `ALLOWED_ORIGIN` defaults to `*`, which is acceptable for local smoke testing but not production.
- MEDIUM: `AZURE_OPENAI_API_KEY` is listed in `wrangler.jsonc` vars as an empty string. Secret values should never be put in vars.
- MEDIUM: Error responses can return provider error text directly to clients.

### Correctness and Maintainability
- MEDIUM: `src/index.ts` uses broad `any` types for chunks, search responses, errors, and response payloads.
- MEDIUM: The generated `worker-configuration.d.ts` does not include `KB` or `CF_API_TOKEN`, so it is not a reliable reflection of the runtime Env contract.
- MEDIUM: Model provider names are not aligned with the exploration design (`azureopenai` vs `azure`) and need one canonical public contract.
- MEDIUM: The system prompt hardcodes product facts that should be source-grounded or kept in KB to avoid drift.
- LOW: Runtime code is concentrated in one file; this is manageable now but will become a refactor target as validation/evals grow.

### Dependency Risk
#### Outdated Packages
- `wrangler`: current `3.114.17`, latest `4.95.0`.
- `typescript`: current `5.9.3`, latest `6.0.3`.

#### Heavy Dependencies
- Runtime production dependency count is effectively zero; the Worker relies on platform bindings and Fetch APIs.
- Dev dependency tree is non-trivial through Wrangler/Miniflare: npm audit reported 106 total dependencies.
- Fine-tuning Python dependencies are not represented in a Python lockfile or requirements file; `train_phoenix.py` imports heavy ML libraries (`torch`, `unsloth`, `datasets`, `transformers`, `trl`).

#### Unmaintained/Vulnerable Packages
- `npm audit --json` reported 5 vulnerabilities through the dev toolchain:
  - `undici`: high severity transitive via `miniflare`
  - `esbuild`: moderate
  - `miniflare`: moderate
  - `wrangler`: moderate
  - `ws`: moderate
- The audit's available fix is `wrangler@4.95.0`, a semver-major upgrade.

## Setup/Runbook

### Install
```powershell
npm install
```

### Typecheck
```powershell
npm run typecheck
```

### Local Development
```powershell
npm run dev
```

Requires the Cloudflare AI Search binding and local secrets/vars to be configured. The code expects `CF_API_TOKEN` for Workers AI calls.

### Deploy
```powershell
npm run deploy
```

Deployment requires valid Cloudflare account configuration, the `phoenix-vitruvian-kb` AI Search instance, `CF_ACCOUNT_ID`, `AI_GATEWAY_ID`, and any provider-specific secrets.

### Fine-Tuning Script
```powershell
python train_phoenix.py
```

This requires Python ML dependencies that are not declared in this repo. It is not part of the Cloudflare Worker runtime.

## Code Patterns
- Single-module Worker default export with `fetch(request, env, ctx)`.
- Hand-written JSON responses instead of a response helper.
- CORS headers are generated centrally by `corsHeaders()`.
- Provider dispatch uses a string switch on normalized `MODEL_PROVIDER`.
- Retrieval failures are logged and converted into a fallback "No relevant articles" context.
- Prompt construction is inline inside `handleCoach()`.
- Dataset examples use ChatML JSONL with `messages` arrays and Phoenix-specific tasks.

## Monorepo Structure
_No data available_

No monorepo package boundaries were detected in this directory. The parent folder name includes "Monorepo", but this checkout is a single Worker package with one `package.json`.
