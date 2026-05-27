# Phoenix Coach Cloudflare MVP

## What This Is
Phoenix Coach Cloudflare MVP is a brownfield hardening project for the existing `phoenix-ai` Cloudflare Worker. It turns the current Vitruvian coaching endpoint into a deployable, source-grounded API that retrieves Phoenix/Vitruvian knowledge through Cloudflare AI Search and generates coaching responses through Cloudflare AI Gateway.

The project starts from the saved exploration design at `.planning/explorations/2026-05-27-phoenix-coach-cloudflare-mvp-design.md` and treats the current repository as the source of truth. The MVP deliberately ships RAG and evaluation gates before adding Azure OpenAI or fine-tuning.

## Core Value
Give Phoenix users practical Vitruvian-specific coaching without letting the model invent product facts. Product knowledge stays in traceable KB files, Cloudflare AI Gateway provides routing and observability, Workers AI proves the low-cost baseline, and Azure/fine-tuning are introduced only if eval evidence shows they are needed.

## Who It's For
- Phoenix app or portal users training with a Vitruvian Trainer+.
- Users asking practical hypertrophy, strength, nutrition-basics, and safety questions.
- Phoenix maintainers who need a controlled coaching API before investing in managed Azure models or fine-tuning.

## Requirements

### Validated
(None yet - ship to validate)

### Active
- [ ] R1 Normalize Worker environment and secret names across `src/index.ts`, `wrangler.jsonc`, local dev, and deployment docs.
- [ ] R2 Verify the current Cloudflare AI Search binding and AI Gateway Workers AI call shape against live behavior before launch.
- [ ] R3 Preserve `GET /api/health` and `POST /api/coach` as the MVP API surface.
- [ ] R4 Enforce server-side request validation for message length, history depth, JSON shape, and trusted debug access.
- [ ] R5 Return an answer plus source metadata from retrieved AI Search chunks.
- [ ] R6 Keep Vitruvian-specific claims grounded in KB context, with explicit uncertainty when context is missing.
- [ ] R7 Strengthen safety behavior for pain, injury symptoms, medical limitations, nutrition red flags, and unsafe training requests.
- [ ] R8 Add a focused eval suite for mode choice, weight caps, pain handling, nutrition basics, JSON validity, and hallucinated product claims.
- [ ] R9 Disable or gate raw debug output outside local development.
- [ ] R10 Prepare deployment to `workers.dev` first, with production CORS, auth, rate-limit, and AI Gateway observability controls before real users.
- [ ] R11 Use Workers AI for the MVP baseline and compare Azure OpenAI only after the eval suite establishes a quality gap.
- [ ] R12 Defer fine-tuning until repeated measured failures show that RAG, prompt rules, and structured validation are insufficient.

### Out of Scope
- Fine-tuning a model during the MVP.
- Directly crawling Vitruvian-owned domains through Cloudflare AI Search.
- Medical diagnosis, injury treatment, disease nutrition therapy, or emergency advice.
- A public unauthenticated production endpoint.
- Trusting frontend-provided user IDs, debug flags, or system-prompt overrides.

## Constraints
- Use the existing TypeScript Cloudflare Worker project in this repository.
- Preserve the existing Cloudflare-first architecture unless evidence shows a current API incompatibility.
- Treat fitness, diet, bodyweight, pain, injury, and health-condition data as sensitive.
- No API keys or provider tokens in frontend code, committed files, logs, or debug responses.
- Mapping was skipped for initialization; current source files remain authoritative until `/legion:map --refresh` is run.
- The first production route, auth source, canonical secret name, provider enum spelling, output schema strictness, and KB ownership process remain open decisions.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Design source | `$legion start` followed the latest saved exploration from `/legion:explore`. | `.planning/explorations/2026-05-27-phoenix-coach-cloudflare-mvp-design.md` |
| Codebase map | Source code exists, but the map dataset is absent and Codex lacks the structured prompt tool used by Legion for the map choice. | Skip mapping for this start; use current source reads and allow `/legion:map --refresh` later. |
| Execution mode | Conservative default for a sensitive coaching API and brownfield hardening. | Guided |
| Planning depth | Project is multi-phase but not large enough to justify deep planning before Phase 1. | Standard |
| Cost profile | Keep planning quality high while preserving cost discipline. | Balanced |
| MVP model route | The design recommends proving the Cloudflare baseline before adding Azure complexity. | Workers AI through AI Gateway first |
| Fine-tuning | Existing datasets and training script are useful later, but training now would be premature. | Eval-gated deferral |
| Product fact source | Vitruvian behavior changes over time and should not be guessed by the model. | KB/RAG context is authoritative for product-specific claims |

## Architecture Influences
- Cloudflare Worker TypeScript API with `GET /api/health` and `POST /api/coach`.
- Cloudflare AI Search binding `KB` against `phoenix-vitruvian-kb`.
- Cloudflare AI Gateway `phoenix-ai` for model routing and observability.
- Workers AI baseline model configured in `wrangler.jsonc`.
- Optional Azure OpenAI provider route reserved for later quality comparison.
- Local KB markdown under `kb/` for Vitruvian, safety, hypertrophy, and nutrition knowledge.
- Fine-tuning datasets under `dataset/final/` and `train_phoenix.py` are later-phase assets, not MVP dependencies.

---
*Last updated: 2026-05-27 after initialization*
