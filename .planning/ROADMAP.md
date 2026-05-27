# Phoenix Coach Cloudflare MVP - Roadmap

## Phases

- [x] Phase 1: API Contract and Environment Hardening (3 plans)
- [x] Phase 2: Source-Grounded Retrieval and Safety Behavior (3 plans)
- [ ] Phase 3: Eval Suite and Quality Gates (2 plans)
- [ ] Phase 4: Deployment Readiness and Production Controls (3 plans)
- [ ] Phase 5: Model Escalation Decision (2 plans)

## Phase Details

### Phase 1: API Contract and Environment Hardening
**Goal**: Make the existing Worker endpoint predictable, typed, and safe to run locally before changing behavior.
**Requirements**: R1, R2, R3, R4, R9
**Recommended Agents**: engineering-backend-architect, engineering-security-engineer, testing-api-tester
**Success Criteria**:
- [x] `src/index.ts`, `wrangler.jsonc`, `.dev.vars` expectations, and deployment notes use one canonical Cloudflare token secret name.
- [x] `MODEL_PROVIDER` accepts one documented Workers AI value and one documented Azure value, or intentionally supports aliases with tests.
- [x] `/api/health` and `/api/coach` retain their route contracts.
- [x] Request validation rejects malformed JSON, missing messages, overlong messages, excessive history, and unauthorized debug access.
- [x] TypeScript typecheck passes.
**Plans**: 3

### Phase 2: Source-Grounded Retrieval and Safety Behavior
**Goal**: Make answers depend on retrieved KB context for product facts and behave conservatively for safety-sensitive coaching.
**Requirements**: R5, R6, R7
**Recommended Agents**: engineering-ai-engineer, data-analytics-engineer, testing-qa-verification-specialist
**Success Criteria**:
- [ ] AI Search chunk parsing handles the documented response shapes used by the current binding.
- [ ] Response payload includes source metadata without exposing raw sensitive prompts or system instructions.
- [ ] Vitruvian-specific claims are refused or caveated when retrieved context is absent.
- [ ] Pain, injury, red-flag medical symptoms, extreme dieting, and unsafe supplement requests trigger conservative guidance.
- [ ] KB files include traceable source notes and are not treated as medical advice.
**Plans**: 3

### Phase 3: Eval Suite and Quality Gates
**Goal**: Establish repeatable evidence for Vitruvian accuracy, safety, and output structure before broader rollout.
**Requirements**: R8, R11, R12
**Recommended Agents**: testing-api-tester, testing-test-results-analyzer, engineering-ai-engineer
**Success Criteria**:
- [ ] `evals/prompts.jsonl` covers mode choice, weight caps, pain handling, nutrition basics, JSON output, and hallucinated product claims.
- [ ] A scoring rubric records Vitruvian accuracy, safety, source-grounding, programming quality, personalization, and JSON validity.
- [ ] Local or scripted checks can run the eval prompts against the Worker or model-call boundary.
- [ ] Azure comparison and fine-tuning are explicitly blocked until eval evidence justifies them.
**Plans**: 2

### Phase 4: Deployment Readiness and Production Controls
**Goal**: Prepare a deployable Worker that can be exposed safely to a frontend or domain route.
**Requirements**: R2, R9, R10
**Recommended Agents**: engineering-infrastructure-devops, engineering-security-engineer, testing-performance-benchmarker, testing-qa-verification-specialist
**Success Criteria**:
- [ ] `wrangler dev` and `wrangler deploy` runbook is documented with required secrets and non-secret vars.
- [ ] CORS is restricted for production rather than left as `*`.
- [ ] The design for auth and trusted profile/history hydration is documented before real user data is accepted.
- [ ] Rate limiting or an equivalent abuse-control plan is specified before public launch.
- [ ] AI Gateway logs/analytics are reviewed for cost and sensitive data exposure risk.
**Plans**: 3

### Phase 5: Model Escalation Decision
**Goal**: Decide from evidence whether Workers AI is good enough, whether Azure OpenAI is needed, and whether fine-tuning is worth pursuing.
**Requirements**: R11, R12
**Recommended Agents**: engineering-ai-engineer, data-analytics-engineer, product-technical-writer, project-management-experiment-tracker
**Success Criteria**:
- [ ] Workers AI baseline eval results are captured.
- [ ] Azure OpenAI is compared only if baseline failures are material and repeatable.
- [ ] Fine-tuning criteria are written in terms of repeated eval failures not fixed by RAG, prompt rules, or validation.
- [ ] Existing `dataset/final/*.jsonl` and `train_phoenix.py` are either documented as later assets or revised into the chosen training/eval path.
**Plans**: 2

## Progress

| Phase | Plans | Completed | Status |
|-------|-------|-----------|--------|
| Phase 1: API Contract and Environment Hardening | 3 | 3 | Complete |
| Phase 2: Source-Grounded Retrieval and Safety Behavior | 3 | 3 | Complete |
| Phase 3: Eval Suite and Quality Gates | 2 | 0 | Not started |
| Phase 4: Deployment Readiness and Production Controls | 3 | 0 | Not started |
| Phase 5: Model Escalation Decision | 2 | 0 | Not started |
