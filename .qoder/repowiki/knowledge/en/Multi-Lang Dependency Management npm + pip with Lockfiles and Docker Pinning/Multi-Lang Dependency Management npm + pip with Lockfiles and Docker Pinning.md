---
kind: dependency_management
name: 'Multi-Lang Dependency Management: npm + pip with Lockfiles and Docker Pinning'
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - package-lock.json
    - backend/requirements.txt
    - backend/Dockerfile
    - docker-compose.yml
---

## What system/approach is used

The GeraldOS platform manages third-party dependencies across two language ecosystems using their native package managers:

- **Node.js / TypeScript (Next.js frontend & API routes)**: Managed via `npm` with `package.json` declaring runtime and dev dependencies, and a committed `package-lock.json` lockfile pinning exact transitive versions for reproducible installs.
- **Python (FastAPI backend under `backend/`)**: Managed via `pip` with a flat `backend/requirements.txt` listing pinned versions of all runtime and test dependencies (`fastapi`, `uvicorn`, `sqlalchemy`, `psycopg2-binary`, `pydantic`, `langgraph`, etc.).

There is no Python lockfile (no `poetry.lock`, `Pipfile.lock`, or `requirements.txt` equivalent like `pip freeze` output) — only the top-level `package-lock.json` provides deterministic resolution for Node.

Docker images for external services (Postgres 16, Redis 7, MinIO, Orthanc, Keycloak, HAPI FHIR, Dicoogle, n8n, OHIF, LangGraph) are declared in `docker-compose.yml` and mostly use `:latest` tags, so service binaries are not version-pinned at the image level.

## Key files and packages

- `package.json` — declares Next.js 16.2.6, React 19.2.6, Drizzle ORM 0.45.2, TanStack Query/Table, Radix UI primitives, Tailwind CSS 4, Vitest, ESLint, TypeScript, and other runtime/dev deps.
- `package-lock.json` — committed lockfile that pins every installed Node dependency to an exact version; used by `npm ci` / `npm install` to reproduce the tree.
- `backend/requirements.txt` — flat list of pinned Python packages (e.g. `fastapi==0.110.0`, `langgraph==0.0.26`, `langchain-google-genai==1.0.1`, `pytest==8.1.1`).
- `backend/Dockerfile` — copies `requirements.txt` into the image and runs `pip install --no-cache-dir -r requirements.txt`; this is the authoritative build step for the Python side.
- `docker-compose.yml` — centralizes external service image references (Postgres, Redis, MinIO, Orthanc, Keycloak, HAPI FHIR, Dicoogle, n8n, OHIF, LangGraph) consumed by the platform.

## Architecture and conventions

- **Per-language manifests**: Each language has its own manifest file at the root of its workspace (`package.json` at repo root, `backend/requirements.txt` under the backend subproject). There is no monorepo-style tool (pnpm workspaces, Turborepo, Poetry workspace); the Node side is a single project.
- **Versioning style**:
  - Node dependencies use caret ranges (`^`) for most packages (e.g. `"next": "16.2.6"`, `"react": "19.2.6"`, `"@tanstack/react-query": "^5.101.4"`), allowing minor/patch bumps within the major while still being constrained.
  - Python dependencies are pinned to exact versions with `==` (e.g. `fastapi==0.110.0`, `uvicorn==0.28.0`, `langgraph==0.0.26`), ensuring deterministic installs even without a lockfile.
- **Lockfile strategy**: Only the Node side uses a lockfile (`package-lock.json`). The Python side relies on exact `==` pins in `requirements.txt` as its de-facto pinning mechanism. No `pip-tools`, `Poetry`, or `uv` lockfile is present.
- **Vendoring**: No vendored source trees for third-party libraries exist. Node dependencies resolve from the public npm registry into `node_modules/`; Python dependencies are installed fresh via `pip` during Docker build.
- **Private registries**: No `.npmrc`, `.pypirc`, `PIP_INDEX_URL`, or `PYPI_MIRROR` configuration was found — both registries appear to be the default public ones.
- **Build-time pinning**: The Python Dockerfile explicitly installs from `requirements.txt` inside the container, making that file the canonical source of truth for the backend image. The Node side has no dedicated Dockerfile at the repo root; the `frontend/Dockerfile` exists but was not inspected here.
- **External service pinning**: `docker-compose.yml` pins some service images to specific major versions (e.g. `postgres:16`, `redis:7`) but leaves many others on `:latest` (MinIO, Orthanc, Keycloak, HAPI FHIR, Dicoogle, n8n, OHIF, LangGraph).

## Conventions and constraints

- **Runtime vs dev separation**: Node dependencies are split between `dependencies` (runtime) and `devDependencies` (tooling such as ESLint, PostCSS, Tailwind, Vitest, TypeScript, Drizzle Kit), keeping production images leaner when built with `--production` flags.
- **Exact pins for critical infra**: Database drivers and auth libraries are pinned exactly in both ecosystems (e.g. `pg: 8.20.0`, `drizzle-orm: 0.45.2`, `jose: ^6.2.8`, `python-jose[cryptography]==3.3.0`, `passlib[bcrypt]==1.7.4`), reflecting their security-sensitive nature.
- **No shared lockfile across languages**: Because the repo contains two independent language stacks, each must be updated independently — there is no cross-language dependency synchronization mechanism.
- **Docker build reproducibility**: The Python build is reproducible per `requirements.txt` pin; the Node build is reproducible per `package-lock.json`. Neither environment caches dependencies across layers beyond what `pip`/`npm` provide.
- **Test dependencies co-located**: Test frameworks (`vitest` in Node, `pytest` in Python) are declared alongside runtime deps rather than in separate files, keeping the dependency surface visible in a single manifest per language.