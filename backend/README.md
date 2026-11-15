# VeriSec — Control-plane backend

The **moat** side of VeriSec Labs: identity, tenancy, API keys, billing, webhooks,
audit, orchestration. Separate from the verification **engines** (which live in the
top-level `backend/` FastAPI gateway) so the two never mix.

## Layout

```
verisec_web_ui_back/backend/
  services/
    gateway/   Go 1.25 — the control-plane brain (chi + adopted-tool SDKs)
    console/   NestJS 11 — dashboard API for the Next.js frontend
  infra/       docker-compose for the adopted tools (next step)
  config/      per-tool config files
```

The Python verification workers extend the existing top-level `backend/` (FastAPI +
the native engines); a Temporal worker joins them in Phase 2.

## Toolchains (all already installed)

| | Version |
|---|---|
| Go | 1.22 host · module auto-uses 1.25 toolchain |
| Node · npm · pnpm | 20.19 · 10.8 · 10.33 |
| Python | 3.14 (FastAPI 0.136 present) |
| NestJS CLI | 11 |

## Frameworks installed per service

- **gateway/** (`go.mod`): `go-chi/chi/v5`, `go.temporal.io/sdk`, `openfga/go-sdk`,
  `svix/svix-webhooks/go`, `jackc/pgx/v5`, `redis/go-redis/v9`, `golang-jwt/jwt/v5`.
  `go build ./...` passes.
- **console/** (`package.json`): NestJS 11 + `@nestjs/config`, `svix`, `openid-client`
  (OIDC for Zitadel). `pnpm run build` passes.

## Adopted tools (images already pulled — see the pull summary)

Zitadel · APISIX (+ etcd) · Valkey · OpenFGA · OpenBao · Svix · Temporal (+ UI) ·
Lago · immudb. Postgres is provided externally (you already run one). Wiring +
`infra/docker-compose.yml` is the next step.

## Status

Scaffolding + framework install only. Nothing is wired to a running tool yet.
