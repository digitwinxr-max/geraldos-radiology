---
kind: build_system
name: 'GeraldOS Build & Deployment: Docker Compose + Next.js/Python Multi-Service Orchestration'
category: build_system
scope:
    - '**'
source_files:
    - docker-compose.yml
    - backend/Dockerfile
    - frontend/Dockerfile
    - services/start-all.sh
    - scripts/start-services.sh
    - package.json
    - backend/requirements.txt
    - drizzle.config.json
    - ohif-config/app-config.js
---

## What system/approach is used

The repository builds and deploys a multi-service medical imaging platform using three complementary mechanisms:

1. **Docker Compose** (`docker-compose.yml`) — the canonical production-style deployment that orchestrates PostgreSQL, Redis, MinIO, Orthanc (PACS), Keycloak (OIDC), HAPI FHIR, Dicoogle (DICOM server), n8n (automation), OHIF viewer, and LangGraph Platform as containerized services with health checks and named volumes.
2. **Per-service Dockerfiles** — `backend/Dockerfile` (Python 3.11 slim, uvicorn FastAPI on :8000) and `frontend/Dockerfile` (Node 18 Alpine, multi-stage build with `npm ci`, runs `next dev` in development mode).
3. **Local service bootstrap scripts** — `services/start-all.sh` and `scripts/start-services.sh` start native or Node-mocked versions of the same integration stack (Redis, Orthanc, MinIO, Keycloak, FHIR, Dicoogle, n8n, OHIF, LangGraph) when Docker is not available, probing each endpoint before launching.

Development-time tooling lives in the root `package.json` scripts: `dev` (`next dev`), `build` (`next build`), `start` (`next start`), `test`/`test:watch` (Vitest), `typecheck` (`tsc --noEmit`), `lint` (ESLint), and `db:push` (`drizzle-kit push`).

## Key files and packages

- `docker-compose.yml` — full approved-stack compose definition; defines all runtime services, environment variables, port mappings, `depends_on` with `service_healthy` conditions, and persistent volumes (`pgdata`, `miniodata`, `orthancdata`, `keycloakdata`, `n8ndata`).
- `backend/Dockerfile` — Python 3.11 slim image, installs `build-essential` + `libpq-dev` for psycopg2, copies `requirements.txt` first for layer caching, exposes :8000, runs `uvicorn app.main:app`.
- `frontend/Dockerfile` — multi-stage Node 18 Alpine image; `deps` stage runs `npm ci` from `package.json`+`package-lock.json`, `builder` stage copies source and sets `NEXT_TELEMETRY_DISABLED=1`, exposes :3000, defaults to `npm run dev`.
- `services/start-all.sh` — portable local launcher that starts each service only if its port/endpoint is not already up, logs version/status via curl probes, creates MinIO buckets, and launches LangGraph with `LANGGRAPH_RUNTIME_EDITION=inmem`.
- `scripts/start-services.sh` — variant of the launcher targeting a pre-baked `/tmp` layout (used by the packaged distribution); mirrors the same service set and health-check pattern.
- `package.json` — single-source NPM script surface for the Next.js frontend/API layer; no Makefile exists at the repo root.
- `drizzle.config.json` / `drizzle/` — Drizzle ORM migration files; schema evolution driven by `drizzle-kit` commands invoked via `npm run db:push`.
- `backend/requirements.txt` — pinned Python dependencies consumed by the backend Dockerfile.
- `ohif-config/app-config.js` — OHIF viewer configuration injected into the OHIF container.

## Architecture and conventions

- **Single compose file as the source of truth**: every external dependency (PostgreSQL 16, Redis 7, MinIO, Orthanc, Keycloak, HAPI FHIR, Dicoogle, n8n, OHIF, LangGraph) is declared in `docker-compose.yml`. The compose file uses `healthcheck` blocks with `interval: 5s`, `timeout: 3s`, `retries: 20` so dependent services wait for readiness rather than fixed sleeps.
- **Environment-driven configuration**: the compose comment states "The Next.js app reads every endpoint from environment variables (see .env.example)"; services receive secrets and endpoints via `environment:` blocks (e.g. `POSTGRES_USER`, `MINIO_ROOT_PASSWORD`, `KEYCLOAK_ADMIN`, `REDIS_URI`, `DATABASE_URI`).
- **Dual runtime modes**: production-like containers via Docker Compose vs. a self-contained local mode where `services/start-all.sh` spawns processes directly (or Node-mocked servers) on `127.0.0.1` ports. Both modes target the same port map (Postgres :5432, Redis :6379, MinIO :9000/:9001, Orthanc :8042, Keycloak :8180, FHIR :8090, Dicoogle :8095, n8n :5678, OHIF :3001, LangGraph :8123).
- **Health-probe startup guard**: both launchers use an idempotent pattern — `if ! check_port <port> <path>; then start... fi` — so re-running the script is safe and skips already-running services.
- **Frontend built with Next.js App Router**: the root project is a Next.js application whose API routes live under `src/app/api/*`; the same process serves UI pages and backend-facing routes, while the separate `backend/` FastAPI service handles agent orchestration.
- **Database migrations are code-first**: Drizzle schema lives in `src/db/schema.ts` and migrations in `drizzle/0000_redundant_the_twelve.sql`; pushes are done via `npm run db:push` against the Postgres container.

## Conventions and constraints

- **No Makefile**: build and orchestration are expressed entirely through NPM scripts, Docker Compose, and Bash launchers; there is no top-level `Makefile`.
- **Port contract is enforced by the launcher**: each service must respond on its assigned port for the startup scripts to consider it ready; changing a port requires updating both `docker-compose.yml` and the corresponding `check_port` call in `services/start-all.sh` / `scripts/start-services.sh`.
- **Persistent data is explicit**: every stateful service declares a named volume in `docker-compose.yml` (`pgdata`, `miniodata`, `orthancdata`, `keycloakdata`, `n8ndata`); the local launcher writes to `/tmp/<service>` directories instead.
- **LangGraph runs in-memory edition locally**: the launcher sets `LANGGRAPH_RUNTIME_EDITION=inmem` and points `REDIS_URI` and `DATABASE_URI` at localhost, indicating the local mode is intended for development/demo rather than persistence.
- **Frontend Dockerfile defaults to dev mode**: the `CMD` is `npm run dev`, with a comment noting that a real production build would run `npm run build`; this signals the provided image is for development/orchestration, not hardened production serving.
- **Backend image pins Python 3.11-slim and installs system deps inline**: `build-essential` and `libpq-dev` are installed in the same layer as pip install to keep the image small but compilable for native extensions.