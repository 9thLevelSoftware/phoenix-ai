# Phoenix Coach Cloudflare MVP

Cloudflare Worker API for Phoenix Coach. The Worker exposes `GET /api/health`
and `POST /api/coach`, retrieves Vitruvian/Phoenix knowledge through the `KB`
AI Search binding, and routes model calls through Cloudflare AI Gateway.

The MVP uses Workers AI first. Azure OpenAI is an optional provider path for
later comparison after the eval and smoke checks show it is needed.

## Install

```powershell
npm install
```

## Environment Contract

Non-secret values live in `wrangler.jsonc` under `vars`.

| Name | Required | Notes |
| --- | --- | --- |
| `CF_ACCOUNT_ID` | yes | Cloudflare account that owns the Worker and AI Gateway. |
| `AI_GATEWAY_ID` | yes | Defaults to `phoenix-ai`. |
| `MODEL_PROVIDER` | yes | Must be `workersai` or `azureopenai`. |
| `WORKERS_AI_MODEL` | Workers AI | Defaults to `@cf/moonshotai/kimi-k2.6`. |
| `AZURE_RESOURCE_NAME` | Azure only | Azure OpenAI resource name, not a secret. |
| `AZURE_DEPLOYMENT_NAME` | Azure only | Azure OpenAI deployment name. |
| `AZURE_API_VERSION` | Azure only | Azure API version. |
| `ALLOWED_ORIGIN` | yes | Use `*` only for local smoke testing. |
| `PHOENIX_DEBUG_ENABLED` | debug only | Set to `true` only outside production or for trusted diagnostics. |

Secrets are not stored in `wrangler.jsonc`.

```powershell
npx wrangler secret put CF_API_TOKEN
npx wrangler secret put PHOENIX_DEBUG_TOKEN
npx wrangler secret put AZURE_OPENAI_API_KEY
```

`CF_API_TOKEN` is the canonical Workers AI token secret. `AZURE_OPENAI_API_KEY`
is optional and only used when `MODEL_PROVIDER=azureopenai`. `PHOENIX_DEBUG_TOKEN`
is required only when trusted debug responses are enabled.

For local development, copy `.dev.vars.example` to `.dev.vars` and fill in local
values. Do not commit `.dev.vars`.

## Local Development

```powershell
npm run dev
```

The Worker expects the AI Search instance binding in `wrangler.jsonc`:

- binding: `KB`
- instance: `phoenix-vitruvian-kb`
- remote local development: enabled with `remote: true`

## Verification

```powershell
npm run typecheck
```

Phase 1 adds additional contract and smoke checks. Until those scripts exist,
the typecheck command is the baseline local verification.

## Debug Access

Request body `debug: true` is not enough to receive debug metadata. The Worker
requires both:

- `PHOENIX_DEBUG_ENABLED=true`
- header `X-Phoenix-Debug-Token` matching `PHOENIX_DEBUG_TOKEN`

Debug responses must not expose raw prompts, secrets, or full provider payloads.

## Deployment

Set required non-secret vars in `wrangler.jsonc`, store secrets with Wrangler,
then deploy:

```powershell
npm run deploy
```

Before exposing the endpoint to real users, replace wildcard CORS with the
production origin and add the planned auth, rate-limit, and observability gates.
