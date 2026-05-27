# Codebase Map Search Protocol

This directory contains the Legion codebase map dataset for `phoenix-ai`.

## Required Artifacts
- `.planning/CODEBASE.md`
- `.planning/codebase/index.jsonl`
- `.planning/codebase/symbols.json`
- `.planning/codebase/search.md`
- `.planning/config/directory-mappings.yaml`

## Query Planning
For `/legion:map --query "<topic>"`, normalize the query into:

- `terms`: important nouns, verbs, products, and risk words.
- `path_hints`: explicit file or directory names.
- `symbol_hints`: function, interface, route, or config names.
- `domain_hints`: likely domains such as Worker API, AI Search, AI Gateway, KB, safety, evals, or fine-tuning.

## Retrieval Order
1. Search explicit path hints in `index.jsonl` and `symbols.json`.
2. Search symbol hints in `symbols.json`.
3. Search query terms and aliases in `index.jsonl`.
4. Search `.planning/CODEBASE.md` headings for broad architecture context.
5. Read the original source files for the top matches before planning or editing code.

## Ranking
Rank matches by:

- Exact path or symbol match.
- Keyword or alias overlap.
- Same domain as the requested work.
- Risk level and centrality.
- Current source confirmation.

Return at most 5 primary chunks and up to 5 read-next paths unless the user asks for broader analysis.

## Example
Query:

```text
/legion:map --query "debug output system prompt leak"
```

Expected top match:

| Rank | Chunk | Path | Lines | Kind | Why it matched |
|------|-------|------|-------|------|----------------|
| 1 | `map:src-index-llm-response-debug:001` | `src/index.ts` | 350-415 | api | keywords `debug`, `systemPrompt`, and high security risk |

Read next:

- `src/index.ts` lines 384-392 for debug response contents.
- `src/index.ts` lines 122-185 for retrieved chunks and retrieval error population.
- `.planning/CODEBASE.md` `## Risks` for current risk framing.

## Consumer Safety Rules
- Do not treat chunk summaries as source of truth for code edits.
- Read current source files before making implementation, review, or planning claims.
- If the map conflicts with current source, current source wins and the map should be refreshed.
- Do not inject the entire map into an agent prompt when a targeted query is enough.
