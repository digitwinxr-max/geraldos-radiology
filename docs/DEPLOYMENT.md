# GeraldOS Deployment & Operations Guide

This document defines the production deployment architecture, configuration
parameters, and the exact first-deployment sequence for GeraldOS.

---

## 1. Architecture

Lean production topology (no Redis, MinIO, Keycloak, Dicoogle, n8n, FHIR or
LangGraph):

```
┌────────────────────────────────────────────────────────┐
│                   GeraldOS (Next.js)                   │
│  app · PostgreSQL · Orthanc · OHIF                     │
│                                                        │
│  PostgreSQL  → authoritative store (staff, patients,   │
│                workflow, reports, events, audit)       │
│  Orthanc     → authoritative DICOM storage + DICOMweb  │
│  OHIF        → web viewer (served through the GeraldOS │
│                same-origin DICOMweb proxy)             │
└────────────────────────────────────────────────────────┘
```

- **Docker Compose** (`docker-compose.yml`): app + postgres + orthanc + ohif —
  for local/demo deployments.
- **Render Blueprint** (`render.yaml`): GeraldOS web service + PostgreSQL +
  private Orthanc + private OHIF — for production.

---

## 2. First-deployment sequence

The exact sequence below is the production release path. Steps 1–5 are
automatic on Render (Blueprint); the rest are explicit one-time operations.

### 1. Database creation
- **Compose**: `docker compose up -d postgres` creates the `geraldos` database.
- **Render**: the Blueprint creates the managed `geraldos-db` PostgreSQL
  instance automatically; `DATABASE_URL` is injected into the web service.

### 2. Migrations
- **Compose (host-side)**: `npm run db:push` (development) or
  `npm run db:migrate` (applies `drizzle/*.sql` via drizzle-kit).
- **Render (automatic)**: the web service's `preDeployCommand` runs
  `node scripts/db-seed.mjs migrate` after the image build and BEFORE the new
  version starts. Migration failure fails the deployment — the app never boots
  against an unmigrated schema. The runtime image ships the migration assets
  and drizzle-kit (deploy layer) so no host tooling is required.
- **Manual (any environment)**: `node scripts/db-seed.mjs migrate`.

### 3. Administrator bootstrap (one-time)
The first administrator is created explicitly with:

```bash
ADMIN_EMAIL=you@gerald.co.bw ADMIN_PASSWORD='<strong min-12-char password>' \
  node scripts/db-seed.mjs bootstrap-admin
```

or `npm run db:bootstrap-admin`. Properties:

- Credentials come from the environment only — never CLI args, never logged.
- Password is hashed with the native-auth scrypt parameters
  (`scrypt$16384$8$1$salt$key`, 16-byte salt, 64-byte key, timing-safe verify);
  plaintext is never stored.
- Upserts a single `role=administrator`, `status=active` staff row; the
  `staff_email_unique` index (migration `0003_staff_email_unique`) makes it
  idempotent — re-running refreshes the same row, never duplicates.
- Refuses to run with missing/weak credentials (exit non-zero before any write).

On Render, set `ADMIN_EMAIL` / `ADMIN_PASSWORD` as service env vars (Dashboard,
secrets), then run the command from the service's **Render Shell** (one-time).
It is NOT run on every deploy and demo data is never seeded automatically.

### 4. GeraldOS deployment
- **Compose**: `docker compose up -d --build` builds and starts the whole stack.
- **Render**: the Blueprint web service builds the Docker image and starts
  `node server.js` (Dockerfile CMD) with `NODE_ENV=production`,
  `DATABASE_URL`, `AUTH_SECRET` (auto-generated), `PORT=3000`, `HOSTNAME=0.0.0.0`.

### 5. Orthanc deployment/configuration
- **Compose**: `docker compose up -d orthanc` (image built from
  `docker/orthanc/Dockerfile`, persistent volume `orthancdata`).
- **Render**: a PRIVATE service (`geraldos-orthanc`, no public URL) built from
  `docker/orthanc/Dockerfile` with a 10 GB persistent disk mounted at
  `/var/lib/orthanc/db`.
- Configuration (both): Orthanc env vars — `ORTHANC__NAME`,
  `ORTHANC__DICOM_WEB__ENABLE=true`, `ORTHANC__AUTHENTICATION_ENABLED=true`,
  `ORTHANC__PLUGINS` (DICOMweb plugin), and `ORTHANC__REGISTERED_USERS`
  `{"orthanc":"<strong-password>"}`. The GeraldOS web service must be wired
  with the SAME credentials: `ORTHANC_URL`, `ORTHANC_USERNAME=orthanc`,
  `ORTHANC_PASSWORD` (Render injects `ORTHANC_URL` from the private service's
  internal `hostport`).

### 6. OHIF deployment/configuration
- **Compose**: `docker compose up -d ohif` (image built from
  `docker/ohif/Dockerfile`; served at http://localhost:3001).
- **Render**: a separate web service (`geraldos-ohif`) built from
  `docker/ohif/Dockerfile` — browser-reachable so the viewer can actually be
  loaded. The OHIF image listens on `$PORT` (Render injects it). GeraldOS gets
  `OHIF_URL` from the OHIF service's internal `hostport` (server-side health
  checks) and `OHIF_PUBLIC_URL` should be set to the OHIF service's public
  onrender.com URL.
- Configuration: the viewer data source points at the GeraldOS **same-origin
  DICOMweb proxy** (`/api/orthanc/dicom-web`, WADO-URI, QIDO-RS, STOW-RS) via
  `ohif-config/app-config.js` — the browser never talks to Orthanc directly,
  so no CORS configuration is required and Orthanc credentials never leave the
  server. Cross-origin embedding from a separate public origin is subject to
  the SameSite=Lax cookie model (see §6 — Identity & viewer topology notes):
  the fully embedded viewer
  authenticates only when OHIF is served from the same origin as GeraldOS
  (reverse-proxy co-location); the imaging page's same-origin series
  inspection works in every topology.

### 7. Health verification
- `GET /api/health` — public probe; returns `200 {"status":"healthy"}` when the
  DB is reachable, `503 {"status":"unhealthy"}` otherwise (Render readiness).
- `GET /api/integrations/status` — authenticated; reports `connected` /
  `unreachable` / `not_configured` for Orthanc and OHIF with latency.

### 8. Administrator login
- Open the app, sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from step 3.
- Verify: `GET /api/auth/me` returns the session user with
  `roles: ["administrator"]`; `GET /api/staff` returns 200 (admin permission).

### 9. Imaging verification
- Register a patient (reception), create a workflow study, upload a DICOM file
  at `/api/orthanc/upload` (or via DICOM push to Orthanc), confirm the study
  reconciles into the worklist, and open the OHIF viewer deep link
  (`${OHIF_PUBLIC_URL}/viewer?StudyInstanceUIDs=<uid>` or, on Render, the
  same-origin viewer through the GeraldOS proxy).

---

## 3. Environment configuration

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | Yes | `production` for production builds. |
| `DATABASE_URL` | Yes | PostgreSQL connection string. |
| `AUTH_SECRET` | Yes | HS256 session signing secret (≥32 random bytes; dev default rejected in production). |
| `PUBLIC_APP_URL` | Prod | Browser-facing origin (Render). |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Bootstrap | One-time first administrator (secrets; see step 3). |
| `ORTHANC_URL` / `ORTHANC_USERNAME` / `ORTHANC_PASSWORD` | Imaging | Orthanc REST credentials (server-side only). |
| `OHIF_URL` / `OHIF_PUBLIC_URL` | Imaging | OHIF server health target / browser-facing viewer origin. |
| `DEV_AUTH` | Dev | Opt-in dev admin login (never in production). |
| `LOG_LEVEL` | No | `debug` \| `info` \| `warn` \| `error`. |

---

## 4. Container build (`Dockerfile`)

Multi-stage build:
1. `deps` — `npm ci --force` (skips the npm 10 optional-platform check that
   rejects the pinned `@esbuild/aix-ppc64` package on linux-x64; never
   `--omit=optional`).
2. `builder` — `next build` standalone.
3. `deploy` — copies ONLY the migration/bootstrap toolchain (scripts, `drizzle/`,
   `drizzle.config.ts`, drizzle-kit + its runtime deps, pg).
4. `runner` — non-root `nextjs`; standalone server + static assets + deploy
   toolchain. `CMD ["node","server.js"]`.

---

## 5. Backup & recovery

```bash
# Backup
docker exec -t geraldos-postgres-1 pg_dump -U geraldos_admin -d geraldos -Fc \
  > geraldos_backup_$(date +%Y%m%d_%H%M%S).dump

# Restore
docker exec -i geraldos-postgres-1 pg_restore -U geraldos_admin -d geraldos \
  --clean --if-exists < geraldos_backup.dump
```

On Render, use the managed Postgres backup feature (point-in-time restore).

---

## 6. Identity & viewer topology notes

- **Identity**: native — staff rows in PostgreSQL carry scrypt password hashes;
  sessions are HS256 JWTs signed with `AUTH_SECRET`. Rotate `AUTH_SECRET` to
  invalidate every session.
- **OHIF cookie model**: the session cookie is `SameSite=Lax`. The viewer's
  data source always points at the GeraldOS DICOMweb proxy
  (`/api/orthanc/dicom-web`). When OHIF is served from a different public
  origin than GeraldOS, the browser withholds the session cookie on
  cross-site XHR, so the fully embedded viewer authenticates only when OHIF is
  co-located behind the same origin as GeraldOS (reverse-proxy co-location,
  e.g. routing `/viewer/*` → OHIF). The imaging page's same-origin series
  inspection (`/api/orthanc/proxy`) works in every topology.
