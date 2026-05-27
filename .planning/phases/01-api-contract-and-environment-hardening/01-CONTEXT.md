# Phase 1: API Contract and Environment Hardening - Context

## Phase Goal
Make the existing Worker endpoint predictable, typed, and safe to run locally before changing coaching behavior.

## Source Inputs
- `.planning/PROJECT.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/CODEBASE.md`
- `.planning/explorations/2026-05-27-phoenix-coach-cloudflare-mvp-design.md`
- `src/index.ts`
- `wrangler.jsonc`
- `package.json`
- `worker-configuration.d.ts`
- `README.md`

`REQUIREMENTS.md` is absent, so requirement details are taken from the active requirements in `PROJECT.md`, the Phase 1 entry in `ROADMAP.md`, the design exploration, and current source reads.

## Requirements Covered
- R1: Normalize Worker environment and secret names across `src/index.ts`, `wrangler.jsonc`, local dev, and deployment docs.
- R2: Verify the current Cloudflare AI Search binding and AI Gateway Workers AI call shape against live behavior before launch.
- R3: Preserve `GET /api/health` and `POST /api/coach` as the MVP API surface.
- R4: Enforce server-side request validation for message length, history depth, JSON shape, and trusted debug access.
- R9: Disable or gate raw debug output outside local development.

## What Already Exists
- `src/index.ts` exposes `OPTIONS`, `GET /api/health`, `POST /api/coach`, and JSON 404 handling.
- `src/index.ts` already has an `Env` interface, AI Search `KB.search()` usage, Workers AI routing through Cloudflare REST with `cf-aig-gateway-id`, and Azure OpenAI routing through Cloudflare AI Gateway.
- `wrangler.jsonc` already declares Worker name `phoenix-ai-api`, main `src/index.ts`, compatibility date `2026-05-01`, and AI Search binding `KB` for `phoenix-vitruvian-kb`.
- `package.json` has `dev`, `deploy`, and `typecheck` scripts with no test script yet.
- `worker-configuration.d.ts` is generated and currently does not include the `KB` binding or the `CF_API_TOKEN` secret.
- `README.md` only contains the project title and needs real setup, local dev, secrets, and verification guidance.
- The codebase map identifies high risks in debug prompt leakage, permissive CORS, broad `any` boundary types, secret placeholders in vars, provider enum drift, and missing Worker tests.

## Key Design Decisions
- Canonical Cloudflare token secret: keep the existing code name `CF_API_TOKEN` instead of introducing a second `CLOUDFLARE_API_TOKEN` spelling. This is the smallest coherent change and matches the current Worker implementation.
- Provider enum: support exactly `workersai` and `azureopenai` in Phase 1. Do not add provider aliases unless a migration requirement appears.
- Secret placement: remove `AZURE_OPENAI_API_KEY` from `wrangler.jsonc` vars and document it as an optional Wrangler secret. `CF_API_TOKEN` and `PHOENIX_DEBUG_TOKEN` are also secrets.
- Debug trust boundary: request body `debug: true` is not sufficient. Debug output requires non-production opt-in via env plus a matching trusted request header. The response must not include the raw `systemPrompt`.
- Request contract: reject non-object JSON, empty or overlong `message`, invalid or excessive `history`, unsupported client-supplied `system` history roles, oversized `userProfile`, and unauthorized debug requests.
- Test approach: no new dependency is needed for Phase 1. Use Node's built-in test runner and static/source-level contract checks, plus a smoke script for a running Worker target.
- Architecture proposals: skipped. This is a bounded brownfield hardening phase with direct constraints from the roadmap and codebase map, not an open architecture selection.
- Spec pipeline: skipped. No spec exists, and the Phase 1 requirements are sufficiently concrete for implementation planning.

## Codebase Map Context
- Detected stack: TypeScript Cloudflare Worker, Wrangler, Cloudflare AI Search binding, Cloudflare AI Gateway, optional Azure OpenAI route.
- Relevant map chunks:
  - `map:src-index-types-cors:001` - Env, request shape, and CORS helper.
  - `map:src-index-router-health:001` - route handling for preflight, health, coach, and 404.
  - `map:src-index-coach-retrieval:001` - current coach parsing, weak validation, KB search, and chunk normalization.
  - `map:src-index-provider-dispatch:001` - provider switch and Cloudflare/Azure request construction.
  - `map:src-index-llm-response-debug:001` - response mapping and current debug leakage.
  - `map:wrangler-config:001` - binding and environment vars.
  - `map:package-config:001` - npm scripts and dependencies.
- Risk areas touched:
  - HIGH: `src/index.ts` debug prompt leakage.
  - HIGH: `src/index.ts` unauthenticated API surface and weak request validation.
  - MEDIUM: `wrangler.jsonc` permissive CORS and secret placeholders.
  - MEDIUM: `worker-configuration.d.ts` stale generated env contract.

## Plan Structure
- **Plan 01-01 (Wave 1)**: Normalize environment and local deployment contract - align non-secret vars, secret expectations, local dev docs, and deployment notes.
- **Plan 01-02 (Wave 2)**: Harden Worker request and debug contract - update `src/index.ts` to enforce validation, provider enum behavior, route preservation, and trusted debug access.
- **Plan 01-03 (Wave 3)**: Add contract verification and smoke checks - add Node-based contract tests, a Worker smoke script, npm scripts, and verification docs.

## Wave Rationale
Wave 1 establishes the environment contract before code relies on it. Wave 2 then changes the Worker implementation against that contract. Wave 3 verifies both the config/docs contract and the Worker source behavior, and it depends on the prior two waves to avoid parallel write overlap on `README.md` or assumptions about debug/provider names.

## Confirmation and Auto-Refine
The user invoked `$legion plan 1 --auto-refine` directly. Plans were generated from the explicit command, then stress-tested with the plan-critique checklist. Auto-refine performed zero rewrite cycles because the generated plans had no schema blockers, same-wave file overlaps, or high-impact decision-completeness gaps.
