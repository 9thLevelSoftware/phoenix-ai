# Plan 01-02 Summary - Harden Worker request and debug contract

Status: Complete
Wave: 2
Requirements: R1, R2, R3, R4, R9

## Files Modified
- `src/index.ts`

## Completed Tasks
- Aligned runtime env names with Plan 01-01, including `PHOENIX_DEBUG_ENABLED` and `PHOENIX_DEBUG_TOKEN`.
- Added typed request validation for JSON object shape, message length, history depth/content, user profile size, and debug boolean shape.
- Rejected unauthorized debug requests before retrieval/model calls.
- Removed raw `systemPrompt` and raw chunk debug output from API responses.
- Preserved `GET /api/health`, `POST /api/coach`, CORS preflight, Workers AI `cf-aig-gateway-id`, and Azure provider routing.
- Sanitized client-facing provider errors while keeping bounded server logs for diagnostics.

## Verification Results
- PASS: `npm run typecheck`
- PASS: `node -e "const fs=require('fs'); const s=fs.readFileSync('src/index.ts','utf8'); for (const token of ['MAX_MESSAGE_LENGTH','MAX_HISTORY_MESSAGES','PHOENIX_DEBUG_TOKEN','isTrustedDebugRequest']) if(!s.includes(token)) process.exit(1); if(s.includes('systemPrompt: systemPrompt')) process.exit(1);"`
- PASS: route literal check for `/api/health` and `/api/coach`
- PASS: env/provider token check for `CF_API_TOKEN`, `AZURE_OPENAI_API_KEY`, `PHOENIX_DEBUG_ENABLED`, `PHOENIX_DEBUG_TOKEN`, and `cf-aig-gateway-id`
- PASS: request validation constants and `Bad Request` check
- PASS: debug helper, `403`, and no raw `systemPrompt` response pattern check
- PASS: `git diff --check`

## Handoff Context
- Plan 01-03 can assert the runtime contract by source-level tests without importing/transpiling TypeScript.
- Smoke tests should expect invalid JSON and missing/invalid message requests to return `400`, and unauthorized `debug: true` to return `403`.

## Issues Encountered
- TypeScript caught an initial mismatch between `SourceMetadata[]` and the JSON response payload type. The fix kept the response payload typed as JSON instead of widening to `unknown` or `any`.
