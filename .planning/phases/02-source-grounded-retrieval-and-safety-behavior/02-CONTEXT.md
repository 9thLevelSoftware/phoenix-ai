# Phase 2: Source-Grounded Retrieval and Safety Behavior — Context

## Phase Goal
Make answers depend on retrieved Knowledge Base (KB) context for product facts and behave conservatively for safety-sensitive coaching.

---

## Requirements Covered
- **R5:** Return an answer plus source metadata from retrieved AI Search chunks in the main response payload without exposing raw sensitive prompts.
- **R6:** Keep Vitruvian-specific claims grounded in retrieved KB context. Refuse or caveat claims when retrieved context is absent.
- **R7:** Strengthen safety behavior for pain, injury symptoms, medical limitations, nutrition red flags, and unsafe training requests.

---

## What Already Exists (from prior phases)
- **Phase 1 Hardened Worker Environment:**
  - `src/index.ts` containing the fetch routing (`GET /api/health`, `POST /api/coach`), request parsing/validation (`parseCoachRequest`), trusted debug gating (`isTrustedDebugRequest`), and timed-safe debug credentials.
  - `wrangler.jsonc` declaring canonical Workers AI configuration and the `KB` AI Search binding.
  - `tests/phase1-contract.test.mjs` verifying Worker API contracts and Wrangler settings.
- **Knowledge Base (Seed files):**
  - Six markdown files under `kb/` containing seed content for training modes, strength assessment, membership features, safety boundaries, hypertrophy principles, and nutrition basics.

---

## Key Design Decisions
- **Architectural Philosophy:** Clean Architecture. Instead of packing all new logic and long prompts into `src/index.ts`, we are extracting prompts, safety gates, and retrieval parsing into three separate modules:
  - `src/prompts.ts`: Isolate system prompts and parameters.
  - `src/safety.ts`: Houses user message pre-filters and LLM output post-filters for physiological safety (medical red flags, supplements, diet).
  - `src/retrieval.ts`: Standardizes RAG chunk normalization, `sources` array assembly, and grounding validation checks.
- **sources Payload Location:** Safe source metadata (comprising chunk `id` and `source` title, without raw text chunks or prompts) is returned under a new top-level `sources` key in the main response JSON, making it accessible to client UIs without debug tokens.

---

## Plan Structure
- **Plan 02-01 (Wave 1):** Standardize KB Metadata and Create Prompt/Safety Modules.
  - Updates all 7 KB files with frontmatter and medical disclaimers; creates prompt and safety modules.
- **Plan 02-02 (Wave 1):** Create Retrieval Module and Grounding Validator.
  - Creates the RAG retrieval formatting helper, chunk metadata normalization, and context grounding validation.
- **Plan 02-03 (Wave 2):** Integrate Modules into Controller and Hardened API.
  - Refactors `src/index.ts` to wire all modules, returns the safe `sources` payload, and adds a Node.js integration/safety test suite.
