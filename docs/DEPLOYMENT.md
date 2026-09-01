# GeraldOS Deployment & Operations Guide

This document defines the containerised production deployment architecture, configuration parameters, container lifecycle, and backup/restore procedures for GeraldOS.

---

## 1. Container Topology & Compose Architecture

The platform runs as a Docker Compose bundle defined in `docker-compose.yml`:

```
┌────────────────────────────────────────────────────────┐
│                   Docker Compose Stack                 │
│                                                        │
│  - app (Next.js 16 Standalone, port 3000)              │
│  - postgres (PostgreSQL 16, port 5432)                 │
│  - orthanc (Orthanc DICOM Server, port 8042)           │
│  - ohif (OHIF Web Viewer, port 3001)                   │
│                                                        │
│  (No Keycloak, Redis, MinIO, FHIR, Dicoogle, n8n,      │
│   LangGraph — all removed; see walkthrough.md)         │
└────────────────────────────────────────────────────────┘
```

The integration stack (`docker-compose.integration.yml`) runs PostgreSQL +
Orthanc only for the live-infrastructure test gate.

---

## 2. Quick Start & Execution Commands

### 2.1 Starting the Environment
```bash
docker compose up -d --build
```

### 2.2 Database Initialization & Seeding
```bash
# Apply migrations + seed Botswana operational demo data (development only)
docker compose exec app node scripts/db-seed.mjs all

# The seed refuses to run when NODE_ENV=production.
```

---

## 3. Environment Configuration (`.env`)

| Variable | Required | Default / Example | Purpose |
|---|---|---|---|
| `NODE_ENV` | Yes | `production` | Enables production optimisations and strict security checks. |
| `DATABASE_URL` | Yes | `postgresql://geraldos_admin:geraldos_secure_pass@postgres:5432/geraldos` | PostgreSQL connection pool string. |
| `AUTH_SECRET` | Yes | `[32+ byte random base64]` | HS256 JWT cookie signing secret (must NOT match dev default in production). |
| `DEV_AUTH` | No | `false` | Enables local dev admin login (`/api/auth/dev`). Strictly rejected in production. |
| `ORTHANC_URL` | Optional | `http://orthanc:8042` | Orthanc PACS REST URL (server-side only). |
| `ORTHANC_USERNAME` | Optional | `orthanc` | Orthanc HTTP basic auth user. |
| `ORTHANC_PASSWORD` | Optional | `orthanc_secure_pass` | Orthanc HTTP basic auth password. Never leaves the server. |
| `OHIF_URL` | Optional | `http://ohif:80` | OHIF container URL used for server-side health checks. |
| `OHIF_PUBLIC_URL` | Optional | `http://localhost:3001` | Browser-reachable OHIF origin exposed to the workstation iframe and CSP `frame-src`. Set this when `OHIF_URL` is only resolvable inside the Docker network. See §7 for the cookie-model constraint on cross-origin viewers. |
| `LOG_LEVEL` | No | `info` (`debug`, `info`, `warn`, `error`) | Application log verbosity. |

The platform requires no other secrets: authentication is native (PostgreSQL
staff records + `AUTH_SECRET` sessions) and DICOM storage is Orthanc's.

---

## 4. Production Container Build (`Dockerfile`)

The `Dockerfile` employs a multi-stage build:
1. `deps`: Installs production and build dependencies via `npm ci --force`
   (the `--force` flag tolerates an optional esbuild platform package that
   npm rejects on some runner architectures).
2. `builder`: Compiles the Next.js standalone server (`npm run build`).
3. `runner`: Minimal runtime with non-root user `nextjs` (UID 1001), copying
   only `.next/standalone`, `.next/static`, and `public/`; `CMD ["node","server.js"]`.

---

## 5. Health Checks & Monitoring

- **Container Liveness Probe**:
  ```bash
  wget -qO- http://localhost:3000/api/health || exit 1
  ```
  Returns `200 OK` with database ping latency, uptime, and memory usage.
- **Metrics Scraping**:
  ```bash
  curl http://localhost:3000/api/metrics
  ```
  Returns request counters, response code distribution, and latency buckets.

---

## 6. Backup & Recovery Procedures

### 6.1 Database Backup
```bash
# Export compressed PostgreSQL dump
docker exec -t geraldos-postgres-1 pg_dump -U geraldos_admin -d geraldos -Fc > geraldos_backup_$(date +%Y%m%d_%H%M%S).dump
```

### 6.2 Database Restore
```bash
# Restore dump into PostgreSQL
docker exec -i geraldos-postgres-1 pg_restore -U geraldos_admin -d geraldos --clean --if-exists < geraldos_backup.dump
```

PostgreSQL is the single source of truth for clinical and operational state;
backing it up backs up the platform.

---

## 7. Identity & Viewer Topology Requirements

### 7.1 Identity (native)
Authentication is native to GeraldOS: staff rows in PostgreSQL carry scrypt
password hashes (`staff.password_hash`), and successful login issues an HS256
session cookie signed with `AUTH_SECRET`. Provision passwords via the staff
administration flow or the development seed; there is no external identity
provider to configure. Rotate `AUTH_SECRET` to invalidate every session.

### 7.2 Embedded OHIF viewer (cookie model constraint)
The workstation embeds OHIF from `OHIF_PUBLIC_URL`. Because the GeraldOS session
cookie is `SameSite=Lax`, an OHIF instance served from a DIFFERENT origin cannot
attach the session cookie when calling `/api/orthanc/dicom-web` — the browser
withholds it on cross-site XHR by design. Deployments that want the embedded
full viewer must serve OHIF from the SAME public origin as GeraldOS (reverse
proxy co-location, e.g. Traefik routing `/viewer/*` → ohif built with
`PUBLIC_URL=/viewer/`). Otherwise use the imaging page's same-origin series
inspection, which works through `/api/orthanc/proxy` with normal auth.
