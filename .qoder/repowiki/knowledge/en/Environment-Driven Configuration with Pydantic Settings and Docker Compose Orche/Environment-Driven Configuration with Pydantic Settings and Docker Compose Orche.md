---
kind: configuration_system
name: Environment-Driven Configuration with Pydantic Settings and Docker Compose Orchestration
category: configuration_system
scope:
    - '**'
source_files:
    - backend/app/core/config.py
    - .env.example
    - docker-compose.yml
    - src/lib/integrations/index.ts
    - src/db/index.ts
    - src/lib/auth/session.ts
    - src/app/api/auth/dev/route.ts
    - drizzle.config.json
    - ohif-config/app-config.js
    - services/orthanc.json
    - docker/orthanc/orthanc.json
    - services/start-all.sh
    - scripts/start-services.sh
---

## What system/approach is used

GeraldOS uses a **pure environment-variable-driven configuration** model across all layers, with no centralized config files at runtime. The FastAPI backend loads settings via `pydantic_settings.BaseSettings` (a typed settings class with defaults), while the Next.js frontend and API routes read values directly from `process.env`. Service orchestration is handled by `docker-compose.yml`, which injects service-specific environment variables into each container, and by Node/Python startup scripts that pass inline env vars when launching auxiliary services.

## Key files and packages

- **Backend settings**: `backend/app/core/config.py` — defines a `Settings(BaseSettings)` class with typed fields and default values for every external dependency (PostgreSQL, Redis, MinIO, Keycloak, Orthanc, FHIR, Gemini).
- **Env template**: `.env.example` — documents every required variable for local development (DATABASE_URL, AUTH_SECRET, KEYCLOAK_*, ORTHANC_*, OHIF_URL, DICOOGLE_URL, FHIR_URL, N8N_*, LANGGRAPH_*, MINIO_*, REDIS_URL).
- **Docker Compose**: `docker-compose.yml` — declares all infrastructure services (postgres, redis, minio, orthanc, keycloak, hapi-fhir, dicoogle, n8n, ohif, langgraph) and injects their runtime env vars; also sets up named volumes for persistence.
- **Frontend DB client**: `src/db/index.ts` — reads `DATABASE_URL` from `process.env` to connect Drizzle ORM.
- **Integration registry**: `src/lib/integrations/index.ts` — centralizes all downstream service URLs/credentials as an object built from `process.env` keys (KEYCLOAK_*, ORTHANC_*, OHIF_URL, DICOOGLE_URL, FHIR_URL, N8N_*, LANGGRAPH_*, MINIO_ENDPOINT).
- **Auth/session secret**: `src/lib/auth/session.ts` — reads `AUTH_SECRET` with a dev fallback.
- **Dev feature flag**: `src/app/api/auth/dev/route.ts` — checks `DEV_AUTH` env var to gate development-only auth behavior.
- **Drizzle CLI**: `drizzle.config.json` — hardcodes a PostgreSQL connection URL for migration tooling (separate from runtime).
- **OHIF viewer config**: `ohif-config/app-config.js` — sets `window.config` pointing DICOMweb endpoints through the GeraldOS proxy (`/api/orthanc/dicom-web`) so the browser never contacts Orthanc directly.
- **Service bootstrap scripts**: `services/start-all.sh` and `scripts/start-services.sh` — start in-process mocks of Keycloak/FHIR/Dicoogle/n8n/OHIF/LangGraph and pass inline env vars (e.g. `REDIS_URI`, `DATABASE_URI`, `LANGGRAPH_RUNTIME_EDITION=inmem`).
- **Orthanc configs**: `services/orthanc.json` and `docker/orthanc/orthanc.json` — static JSON files defining Orthanc plugins, ports, authentication, and DICOMweb roots for different deployment modes.

## Architecture and conventions

1. **Single source of truth per layer**:
   - Backend: one `Settings` class in `backend/app/core/config.py` consumed by FastAPI.
   - Frontend/API: direct `process.env.*` access scattered where needed, but consolidated in `src/lib/integrations/index.ts` for downstream clients.
   - Infrastructure: `docker-compose.yml` is the authoritative list of all runtime services and their env vars.

2. **Defaults + overrides pattern**: Every setting has a sensible default in code (e.g. `DATABASE_URL=postgresql://geraldos_admin:geraldos_secure_pass@postgres:5432/geraldos`, `KEYCLOAK_REALM=GeraldOS`, `LANGGRAPH_ASSISTANT_ID=geraldos-agent`) and can be overridden by `.env` or compose env blocks. This lets the platform run out-of-the-box with docker-compose without any user edits.

3. **Environment-scoped secrets**: Secrets (DB passwords, MinIO keys, Keycloak client secrets, API keys) are always injected via environment variables — never committed. `.env.example` shows placeholder values; real values come from the deployer's environment.

4. **Proxy-based front-end isolation**: The OHIF viewer is configured to talk only to the GeraldOS Next.js proxy (`/api/orthanc/dicom-web`), keeping Orthanc credentials server-side and avoiding CORS issues. The browser never receives downstream service URLs directly.

5. **Per-service bootstrap scripts**: Non-Docker local development uses `services/start-all.sh` / `scripts/start-services.sh` to launch lightweight Node/Python mock implementations of Keycloak, FHIR, Dicoogle, n8n, and OHIF, passing their own env vars inline so they behave like the real services.

6. **Tooling vs runtime separation**: `drizzle.config.json` holds its own DB URL for the Drizzle CLI, separate from runtime `DATABASE_URL` — tooling configs are not loaded by the application.

## Conventions and constraints

- **Every external dependency must be configurable via an environment variable** — there is no hardcoded URL/credential path in business logic; all downstream connections go through `process.env` lookups with documented defaults.
- **`.env.example` is the canonical reference** for required variables; adding a new integration requires adding entries here alongside code changes.
- **Docker Compose is the production entry point** — `docker-compose.yml` is the single place where service topology, ports, healthchecks, and env injection are declared; new services should be added here rather than ad-hoc.
- **Feature toggles use boolean env flags** — e.g. `DEV_AUTH=true` gates development-only auth behavior; this is the established pattern for runtime feature switches.
- **Orthanc has two config profiles**: `services/orthanc.json` (development, minimal, with DICOMweb plugin) and `docker/orthanc/orthanc.json` (production-style, with PostgreSQL storage plugins and explicit DICOMweb root paths). The active profile depends on how Orthanc is launched.
- **OHIF viewer config must keep `extensions` and `modes` as arrays** — the comment in `ohif-config/app-config.js` explicitly states that omitting them breaks app boot because the standalone bundle carries the implementations.
- **No runtime file-based config loading** — the application does not read YAML/TOML/JSON config files at startup; everything comes from environment variables (the only JSON files present are static service configs for Orthanc and Drizzle tooling).