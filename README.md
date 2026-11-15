# VeriSec

Identity verification, KYC and fraud-prevention platform: a web console plus a
set of backend microservices for document capture, data extraction, screening
and verification workflows.

## Structure

```
backend/
  services/
    gateway/          API gateway (Go)
    console/          KYC console API: verifications, workflows, billing, team (NestJS)
    micr/             Cheque MICR extraction service
    card/             Payment-card reader service
    bin_engine/       BIN / card-metadata lookup
    scanning_common/  Shared scanning utilities
  infra/
    docker-compose.yml  Local dev stack (identity, object store, DB, webhooks)
    .env.example        Required environment variables (no secrets committed)
frontend/             Web console and verification UI (Next.js + React)
```

## Running locally

Each service documents its own setup in its folder. In broad strokes:

1. Copy `backend/infra/.env.example` to `.env` and fill in local values.
2. Bring up the infra stack: `docker compose -f backend/infra/docker-compose.yml up -d`.
3. Install and run each service (`go run`, `pnpm start:dev`, `uvicorn`, as applicable).
4. Install and run the frontend: `cd frontend && pnpm install && pnpm dev`.

## Notes

- No secrets, private keys, model weights or runtime data are committed. Those
  are provided via environment variables and local volumes.
- `.env.example` lists every variable the stack expects.
