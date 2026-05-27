# Design Exploration - Phoenix Coach Cloudflare MVP

## Initial Ask
Explore the Cloudflare-first implementation route from the shared ChatGPT discussion for a Phoenix Coach API:

- Cloudflare Worker API
- Cloudflare AI Search for Vitruvian, exercise-science, safety, and nutrition knowledge
- Cloudflare AI Gateway for model routing and observability
- Workers AI first for low-cost MVP testing
- Azure OpenAI later only if answer quality or managed fine-tuning needs justify it

The local repository is `phoenix-ai`, a TypeScript Cloudflare Worker project that already contains:

- `src/index.ts` with `GET /api/health` and `POST /api/coach`
- `wrangler.jsonc` with an `ai_search` binding named `KB` for `phoenix-vitruvian-kb`
- initial KB markdown files under `kb/`
- fine-tuning-oriented JSONL datasets under `dataset/final/`
- `train_phoenix.py`, an Unsloth QLoRA script for local model fine-tuning experiments

## Research Summary

- Facts:
  - Cloudflare AI Search currently supports Worker bindings through `ai_search` or `ai_search_namespaces`; direct instance bindings expose methods like `env.MY_SEARCH.search()`, and `remote: true` supports local `wrangler dev` against a deployed instance.
  - Cloudflare AI Gateway provides REST endpoints including `/ai/run` and OpenAI-compatible `/ai/v1/chat/completions`; Workers AI requests routed through AI Gateway require a `cf-aig-gateway-id` header.
  - Cloudflare's Azure OpenAI provider-native AI Gateway route uses `https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/azure-openai/{resource_name}/{deployment_name}` with the Azure deployment path and API version appended.
  - Cloudflare AI Search website crawling is for domains owned/onboarded in the same Cloudflare account, so Vitruvian support pages should not be crawled directly unless mirrored into owned documentation or summarized into uploaded files.
  - AI Search instances created after April 16, 2026 include built-in storage and built-in vector indexing; new-instance beta limits include 4 MB max file size, with Workers AI and AI Gateway billed separately.
  - Vitruvian's current docs say Trainer+ starts under tension at 8 lb / 4 kg and caps selectable load to weights proven through Strength Assessment or exercise history.
  - Vitruvian's current docs describe Old School as non-adaptive, and Time Under Tension, Pump, Eccentric Only, and Echo as adaptive modes with different load and tempo behaviors.
  - Vitruvian's membership docs state All Access includes classes/programs, workout creation/sharing, performance tracking, and new features; without renewal, the Trainer+ still supports desired weight and adaptive digital weight but loses premium features.
  - The local project currently has `wrangler@3.114.17`, `typescript@5.9.3`, and `@cloudflare/workers-types@4.20260527.1` installed.

- Inferences:
  - This should be treated as a brownfield hardening plan rather than a greenfield scaffold; the repo already implements the rough MVP, but needs alignment, validation, and production guardrails.
  - RAG should be the source of truth for product-specific Vitruvian claims. Fine-tuning should shape answer style/schema only after retrieval quality and prompt rules are proven insufficient.
  - The highest-risk current gaps are not model quality. They are endpoint hardening, secret naming consistency, current Cloudflare API compatibility, debug leakage, rate limiting/auth, and measurable evals.
  - Existing `dataset/final/*.jsonl` and `train_phoenix.py` are useful later, but running local QLoRA before the Cloudflare RAG MVP has live eval evidence would add cost and complexity in the wrong order.

- Assumptions:
  - The target deployment remains Cloudflare Workers with Cloudflare AI Search as the primary retrieval service.
  - Initial user surface is a web/frontend chat form or portal integration that calls `/api/coach`.
  - Workers AI is acceptable for the first deployed MVP if safety, product accuracy, and JSON structure pass eval thresholds.
  - Azure OpenAI is optional phase-two model routing, not a dependency for MVP launch.
  - The endpoint should eventually serve authenticated Phoenix users and may receive sensitive fitness, pain, bodyweight, or diet context.

## Product Definition

- Target users:
  - Phoenix app or portal users training with a Vitruvian Trainer+
  - Users asking practical hypertrophy, strength, nutrition-basics, and safety questions
  - Product maintainers who need a controlled, source-grounded coaching API before investing in fine-tuning

- Primary outcome:
  - A deployed `/api/coach` endpoint that returns practical, safe, source-grounded coaching answers with visible source references and no invented Vitruvian product claims.

- Value proposition:
  - Phoenix Coach gives Vitruvian-specific coaching while keeping the expensive or fragile pieces optional: retrieval carries product facts, Cloudflare AI Gateway provides observability and model routing, and Azure/fine-tuning are introduced only after evals prove they are needed.

- Non-goals:
  - No fine-tuned model in the MVP.
  - No direct crawling of Vitruvian-owned domains through AI Search.
  - No medical diagnosis, injury treatment, disease nutrition therapy, or emergency guidance.
  - No public unauthenticated production endpoint without rate limiting and CORS/auth controls.
  - No reliance on frontend-provided user IDs, debug flags, or user-supplied system prompt content.

## Recommended Approach

Use the balanced Cloudflare-first RAG MVP.

The conservative path would only deploy the current Worker and manually upload KB files, but it leaves too many production risks: debug output can expose raw prompts/responses, auth/rate limits are absent, and current Cloudflare endpoint details need confirmation. The ambitious path would add Azure OpenAI and fine-tuning immediately, but that front-loads complexity before there is evidence that retrieval, prompt design, and evals cannot meet the bar.

The balanced route is:

1. Stabilize the existing Worker contract and environment names.
2. Verify AI Search binding behavior and AI Gateway model calls against current Cloudflare docs.
3. Upload/refresh KB files with source metadata and narrow product claims.
4. Add a small deterministic eval set before broad launch.
5. Deploy Workers AI through AI Gateway.
6. Add auth, CORS, rate limiting, and debug gating before real users.
7. Compare Workers AI against Azure only after MVP answers are measured.
8. Fine-tune only after repeated eval failures show a style/schema gap that RAG and prompt rules do not solve.

## Alternatives Considered

| Approach | Strengths | Tradeoffs | Decision |
|----------|-----------|-----------|----------|
| Conservative: deploy current Worker with manual KB upload | Fastest path to a callable endpoint; minimal code churn | Leaves endpoint hardening, API-shape verification, evals, and production guardrails underdeveloped | Reject as too fragile for user-facing fitness coaching |
| Balanced: harden current Cloudflare RAG MVP, Workers AI first, eval-gated Azure | Preserves simple architecture, uses existing repo, delays cost until evidence supports it | Requires disciplined eval and release gates before adding features | Recommended |
| Ambitious: Azure OpenAI and managed fine-tuning from the start | Potentially better answer quality and schema reliability earlier | Higher cost, more secrets/compliance surface, premature training before eval failures are known | Defer |

## Feature Scope

### MVP
- [ ] Normalize Worker env/secrets and document the canonical names.
- [ ] Confirm the correct Workers AI call shape through AI Gateway for the selected model.
- [ ] Keep AI Search instance binding as `KB`, with `remote: true` for local dev.
- [ ] Return `answer` plus source keys/scores from retrieved chunks.
- [ ] Limit request size and history depth server-side.
- [ ] Use retrieved context for Vitruvian-specific facts and explicitly admit missing context.
- [ ] Add pain/injury and nutrition red-flag safety behavior.
- [ ] Disable or gate debug output outside development.
- [ ] Add a small eval suite covering mode choice, weight caps, pain, nutrition basics, JSON output, and hallucinated product claims.
- [ ] Deploy to `workers.dev` first, then optionally map `/api/coach` on the production domain.

### Later
- [ ] Add authenticated Phoenix user profile hydration from trusted backend state.
- [ ] Add Cloudflare rate limiting and gateway metadata for cost and abuse analysis.
- [ ] Expand KB with attachments, exercise categories, Just Lift/Echo details, progression rules, deload rules, and Phoenix house programming style.
- [ ] Add structured response validation for `workout_plan_json` or a `CoachResponse` schema.
- [ ] Compare Workers AI with Azure OpenAI using the same eval set.
- [ ] Fine-tune only after collecting high-quality examples and identifying repeatable failures not solved by RAG or prompt changes.
- [ ] Build KB ingestion automation so source docs and local summaries stay traceable.

## Experience / Workflow

1. User opens Phoenix app or web portal and asks a coaching question.
2. Frontend sends `POST /api/coach` with:
   - user message
   - a bounded, trusted profile summary when available
   - recent workout summary only after auth exists
3. Worker validates request size, origin/auth, and debug permissions.
4. Worker queries AI Search using the user message and a small amount of recent conversation context.
5. Worker builds a context packet from top chunks, including source keys and scores.
6. Worker sends the system prompt, profile summary, retrieved context, and user question through AI Gateway.
7. Model returns:
   - direct coaching recommendation
   - Vitruvian mode rationale when relevant
   - sets/reps/rest/RIR guidance when programming
   - safety caveats when relevant
   - optional structured workout JSON
8. Worker returns the answer and source metadata.
9. AI Gateway logs and eval results are reviewed before expanding usage.

## Technical Direction

Platform:
- Cloudflare Worker, TypeScript, Wrangler.
- Cloudflare AI Search instance `phoenix-vitruvian-kb`, bound as `env.KB`.
- Cloudflare AI Gateway `phoenix-ai`.
- Workers AI model first; Azure OpenAI provider-native route later if evals justify it.

Current repo alignment:
- `wrangler.jsonc` already uses `ai_search` with `binding: "KB"`, `instance_name: "phoenix-vitruvian-kb"`, and `remote: true`.
- `src/index.ts` already exposes `/api/health` and `/api/coach`.
- Current code uses `CF_API_TOKEN`; the pasted design and Cloudflare examples use `CLOUDFLARE_API_TOKEN`. Pick one canonical name before deployment and keep local `.dev.vars`, Wrangler secrets, and `Env` types consistent.
- Current code supports `MODEL_PROVIDER = "workersai"` and `"azureopenai"`; the pasted design uses `"azure"`. Use one provider enum and document it.
- Current code includes `debug.systemPrompt`, raw chunks, and retrieval errors when `debug` is true. That is useful locally but should be denied in production.
- Current code should be checked against current Cloudflare AI Gateway endpoint behavior for Workers AI. The current docs clearly show Workers AI via `/ai/run` and the OpenAI-compatible endpoint separately; the implementation should verify the selected `@cf/...` model works through the chosen endpoint before launch.

Data and retrieval:
- Keep official Vitruvian product facts in KB markdown with source URLs.
- Do not let the model invent product-specific behavior when retrieved context is missing.
- Prefer built-in AI Search storage for small markdown files now; use R2 or owned website crawling only when source volume or automation requires it.
- Attach metadata to KB items where possible: source URL, source type, last reviewed date, topic, and confidence.

Security and privacy:
- No API tokens in frontend code.
- Secrets go in Wrangler secrets and `.dev.vars`; `.dev.vars`, `.env`, and `.env.*` stay ignored.
- Restrict CORS before production.
- Require user authentication before sending saved profile/history/workout data.
- Never trust frontend user IDs.
- Disable debug response fields in production.
- Add rate limiting before public launch.
- Treat fitness, diet, bodyweight, pain, injury, and health-condition details as sensitive.

Evaluation:
- Create `evals/prompts.jsonl` plus a simple manual or scripted scoring sheet.
- Score at minimum:
  - Vitruvian accuracy
  - safety behavior
  - source-grounding/no hallucinated product claims
  - programming quality
  - personalization
  - JSON/schema validity
- Use the same evals for Workers AI and Azure comparisons.

## Open Questions

- Production route — Decide whether the first real integration stays on `workers.dev` or maps to `yourdomain.com/api/*`.
- Auth source — Decide which Phoenix auth/session layer will authorize `/api/coach` before saved user data or workout history is included.
- Canonical secret names — Choose `CLOUDFLARE_API_TOKEN` or `CF_API_TOKEN` and align code, docs, `.dev.vars`, and Wrangler secrets.
- Provider enum — Choose `workersai`/`azureopenai` or `workersai`/`azure`; avoid supporting multiple spellings unless there is a migration reason.
- Output schema — Decide whether MVP answers are mostly prose with optional JSON or always a strict `CoachResponse` JSON schema.
- KB ownership — Decide who curates and periodically revalidates Vitruvian source summaries as the official app/docs change.

## Start Input

Initialize a brownfield Phoenix Coach Cloudflare MVP project from the existing `phoenix-ai` repository. The goal is to harden and deploy the existing TypeScript Cloudflare Worker that exposes `/api/coach`, retrieves Vitruvian/exercise knowledge through Cloudflare AI Search, and generates answers through Cloudflare AI Gateway using Workers AI first. Azure OpenAI and fine-tuning are deferred until an eval suite proves model quality or schema reliability is insufficient. The first implementation phases should focus on environment/secret consistency, current Cloudflare API compatibility, safe request validation, production debug gating, CORS/auth/rate-limit guardrails, KB source grounding, and a small eval suite for Vitruvian accuracy, safety, no hallucinated product claims, and JSON validity.

## Research Sources

- Cloudflare AI Search Workers binding: https://developers.cloudflare.com/ai-search/api/search/workers-binding/
- Cloudflare AI Gateway REST API: https://developers.cloudflare.com/ai-gateway/usage/rest-api/
- Cloudflare AI Gateway Azure OpenAI provider: https://developers.cloudflare.com/ai-gateway/usage/providers/azureopenai/
- Cloudflare AI Search website data source: https://developers.cloudflare.com/ai-search/configuration/data-source/website/
- Cloudflare AI Search built-in storage: https://developers.cloudflare.com/ai-search/configuration/data-source/built-in-storage/
- Cloudflare AI Search limits and pricing: https://developers.cloudflare.com/ai-search/platform/limits-pricing/
- Microsoft Foundry Azure OpenAI fine-tuning: https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/fine-tuning
- Vitruvian weight selection and Strength Assessment cap: https://knowledge.vitruvianform.com/support/can-you-select-your-own-weights
- Vitruvian training modes: https://knowledge.vitruvianform.com/support/the-training-modes-explained
- Vitruvian All Access membership: https://knowledge.vitruvianform.com/support/all-access-membership
