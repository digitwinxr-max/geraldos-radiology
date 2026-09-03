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
│  OHIF        → web viewer, reverse-proxied by the app  │
│                at /viewer (private, never public)      │
└────────────────────────────────────────────────────────┘
```

Request flow for a study read — one origin, end to end:

```
browser ──HTTPS──► https://<app>/            Next.js (auth, worklist, UI)
        ──HTTPS──► https://<app>/viewer/…    OHIF, proxied by Next.js
        ──HTTPS──► https://<app>/api/orthanc/dicom-web/…   QIDO/WADO/STOW
                                    │
                       (private network, server-side only)
                                    ▼
                        Orthanc  ◄── Basic auth ── GeraldOS
```

The browser only ever talks to the app's own origin. OHIF and Orthanc are
private services with no public URL, and Orthanc credentials never leave the
server. See §6 for why the viewer must share the app's origin.

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
  `DATABASE_URL`, `AUTH_SECRET` (auto-generated) and `HOSTNAME=0.0.0.0`.
  `PORT` is deliberately **not** pinned in `render.yaml`: Render injects it and
  routes public traffic to the same value, so the platform owns the port
  contract and the two cannot disagree. The image defaults to `3000` for local
  `docker run` / compose.

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
- **No credential is baked into the image.** `docker/orthanc/Dockerfile` sets no
  `RegisteredUsers`; with authentication enabled an unset value means Orthanc
  denies every request, so a missing secret fails **closed** and shows up as
  "Orthanc unreachable" on `/settings` rather than as a PACS protected by a
  password that is public in git.
- `PORT` is declared as `8042` on the service to match `ORTHANC__HTTP_PORT`, so
  the `hostport` reference can only resolve to a port something listens on.
- Only the DICOMweb plugin is loaded. The image default loads every plugin it
  ships (Orthanc Explorer 2, a bundled viewer), which would expose a second
  route to clinical images that GeraldOS cannot authorise.

### 6. OHIF deployment/configuration
- **Render**: a PRIVATE service (`geraldos-ohif`, `type: pserv`, no public URL)
  built from `docker/ohif/Dockerfile`. The image's nginx listens on `$PORT`
  (declared as `3001` in the Blueprint); GeraldOS gets `OHIF_URL` from the
  service's internal `hostport`.
- **Compose**: `docker compose up -d ohif` builds the same image. It publishes
  **no** port — the viewer is reached through the app, exactly as on Render.
- **Mount**: Next.js reverse-proxies the viewer at `/viewer` on the app's own
  origin (`next.config.ts` rewrites → `src/app/api/ohif/[[...path]]/route.ts`),
  and `ohif-config/app-config.js` sets `routerBasename: '/viewer'`. This is the
  documented "simple" sub-path setup: the client router is rooted at `/viewer`
  while the bundle keeps requesting its assets from the origin root
  (`/assets/…`, `/app-config.js`), which the app also proxies. `PUBLIC_URL` is
  a *build* argument of the upstream image and cannot be changed at runtime, so
  it is not set anywhere — no rebuild of `ohif/app` is needed.
- **Data source**: the viewer's QIDO-RS / WADO-RS / STOW-RS / WADO-URI roots all
  point at the GeraldOS **same-origin** proxy (`/api/orthanc/dicom-web`,
  `/api/orthanc/wado-uri`) via `ohif-config/app-config.js`. The browser never
  talks to Orthanc directly, so no CORS configuration is required and Orthanc
  credentials never leave the server.
- **Auth**: `/viewer` and its assets sit behind the same edge gate as the rest
  of the app, so the viewer is reachable only when signed in. The session cookie
  is *not* forwarded to the OHIF service (it needs no identity of its own);
  clinical data is authorised separately on every DICOMweb call.

There is no `OHIF_PUBLIC_URL` any more — the viewer has no separate public
origin. Clients learn the mount prefix from `GET
/api/integrations/client-config` (`{"ohifUrl":"/viewer",…}`) and build deep
links such as `/viewer/viewer?StudyInstanceUIDs=<uid>`.

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
  (`https://<app>/viewer/viewer?StudyInstanceUIDs=<uid>` — the same origin you
  are already signed in to).

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
| `OHIF_URL` | Imaging | Internal address of the private OHIF service (server-side only: viewer proxy + health check). Injected by Render from `hostport`. |
| `DEV_AUTH` | Dev | Opt-in dev admin login (never in production). |
| `LOG_LEVEL` | No | `debug` \| `info` \| `warn` \| `error`. |
| `PORT` / `HOSTNAME` | Platform | Injected by Render. `HOSTNAME` must be `0.0.0.0`; `PORT` is left to the platform (see step 4). |
| `ANALYZE` | Build | `true` emits bundle-analyzer reports; ignored at runtime. |

Removed as dead: `OHIF_PUBLIC_URL` (the viewer shares the app's origin, so there
is no browser-facing viewer host to configure).

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
- **OHIF cookie model (why the viewer is same-origin)**: the session cookie is
  `HttpOnly` + `SameSite=Lax` (+ `Secure` in production). Render's free
  hostnames are subdomains of `onrender.com`, **which is on the Public Suffix
  List**, so `geraldos-radiology.onrender.com` and `geraldos-ohif.onrender.com`
  are cross-*site* with respect to each other — not merely cross-origin. A
  viewer on its own subdomain would therefore never receive the session cookie
  on its DICOMweb XHRs, and every way of forcing it is unacceptable:
  `Domain=.onrender.com` is rejected by RFC 6265 across a public suffix (and
  would hand the session to every other tenant on the platform), while
  `SameSite=None` plus CORS `credentials` on clinical-data endpoints weakens
  auth for every user and still breaks as browsers phase out third-party
  cookies. Serving the viewer from the app's own origin removes the problem:
  the cookie is same-site, no CORS is needed, and OHIF can stay private.
  A separate public origin for OHIF would only become viable behind a shared
  custom domain (e.g. `viewer.<your-domain>` under the same registrable
  domain), which is a DNS decision outside this repository.
- **Framing**: the app-wide policy is `X-Frame-Options: DENY` /
  `frame-ancestors 'none'`; the proxied viewer namespace instead gets
  `SAMEORIGIN` / `frame-ancestors 'self'`, so only GeraldOS can embed it.
  The app's `script-src` is deliberately not imposed on the viewer document —
  OHIF needs workers, wasm and blob: URLs for the Cornerstone codecs, and a
  guessed policy would risk a silently broken viewer. See
  `docs/KNOWN_ISSUES.md` for the tracked follow-up.

---

## 7. Render compute plans, cost and required secrets

Every resource in `render.yaml` is on a **paid** plan. That is the floor for
this architecture, not a comfort choice:

| Resource | Type | Plan | Why it cannot be free |
|---|---|---|---|
| `geraldos-radiology` | web | `starter` | Free web services spin down after ~15 min idle, may be restarted at any time, have an ephemeral filesystem, and have **no Render Shell** — which is how the one-time administrator bootstrap is run (step 3). |
| `geraldos-orthanc` | pserv | `starter` | Private services have **no free tier at all**, and persistent disks require a paid plan. The 10 GB disk is the only durable copy of the DICOM imagery. |
| `geraldos-ohif` | pserv | `starter` | Private services have no free tier. |
| `geraldos-db` | Postgres | `basic-256mb` | Free Postgres **expires 30 days after creation** and is then permanently deleted, with no backups and no point-in-time recovery. Unacceptable for a system of record holding patient data. `starter` is a *legacy* database type that Render refuses for new databases. |

Indicative cost at the time of writing: 3 × `starter` services ($7/mo each) +
`basic-256mb` Postgres (~$7/mo) + the 10 GB Orthanc disk (usage-based) ≈
**$28/month plus disk and bandwidth**. Verify current pricing before
committing; disk size can be raised later but never lowered.

**Region**: no resource pins `region`, so all four inherit the Blueprint's
region. This is deliberate — Render's private network spans a single workspace
*and* region, so pinning only some resources would silently split the topology
and make Orthanc unreachable.

**Secrets to set in the Render Dashboard** (all `sync: false`, none committed):

| Service | Variable | Notes |
|---|---|---|
| `geraldos-radiology` | `PUBLIC_APP_URL` | The app's public origin, e.g. `https://geraldos-radiology.onrender.com`. Used for post-login redirects and the CSRF Origin allow-list. |
| `geraldos-radiology` | `ADMIN_EMAIL`, `ADMIN_PASSWORD` | One-time bootstrap only (step 3). `ADMIN_PASSWORD` must be ≥ 12 characters. |
| `geraldos-radiology` | `ORTHANC_PASSWORD` | Must equal the password inside `ORTHANC__REGISTERED_USERS`. |
| `geraldos-orthanc` | `ORTHANC__REGISTERED_USERS` | `{"orthanc":"<strong password>"}`. Until it is set, Orthanc denies all access (fails closed). |

`AUTH_SECRET` is generated by Render (`generateValue: true`); rotate it to
invalidate every session.

After setting the secrets, **redeploy** so the web service picks them up, then
run the bootstrap from the Render Shell and verify `/settings` shows Orthanc,
OHIF and PostgreSQL as `connected`.
