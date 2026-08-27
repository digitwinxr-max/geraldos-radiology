# GeraldOS Deployment & Operations Guide

This document defines the containerised production deployment architecture, configuration parameters, container lifecycle, and backup/restore procedures for GeraldOS.

---

## 1. Container Topology & Compose Architecture

The platform runs as a coordinated Docker Compose bundle defined in `docker-compose.yml`:

```
┌────────────────────────────────────────────────────────┐
│                   Docker Compose Stack                 │
│                                                        │
│  [ Core Services ]                                     │
│  - app (Next.js 16 Standalone, port 3000)              │
│  - postgres (PostgreSQL 16, port 5432)                 │
│  - redis (Redis 7, port 6379)                          │
│  - orthanc (Orthanc DICOM Server, port 8042)           │
│  - ohif (OHIF Web Viewer, port 3001)                   │
│                                                        │
│  [ Optional / Enterprise Integrations ]                │
│  - keycloak (OIDC SSO, port 8180)                      │
│  - hapi-fhir (FHIR R4 Server, port 8090)               │
│  - dicoogle (PACS Indexer & Search, port 8095)         │
│  - n8n (Workflow Automation, port 5678)                │
│  - minio (S3 Object Storage, port 9000/9001)           │
│  - langgraph (AI Agent Runtime, port 8123)             │
└────────────────────────────────────────────────────────┘
```

---

## 2. Quick Start & Execution Commands

### 2.1 Starting the Environment
```bash
# 1. Start core services only (minimal operational stack)
docker compose up -d app postgres redis orthanc ohif

# 2. Or start the complete ecosystem (all integrations)
docker compose up -d

# 3. View live application logs
docker compose logs -f app
```

### 2.2 Database Initialization & Seeding
```bash
# Push Drizzle schema to PostgreSQL
npm run db:push

# Seed Botswana operational demo data (development only)
curl -X POST http://localhost:3000/api/seed
```

---

## 3. Environment Configuration (`.env`)

| Variable | Required | Default / Example | Purpose |
|---|---|---|---|
| `NODE_ENV` | Yes | `production` | Enables production optimisations and strict security checks. |
| `DATABASE_URL` | Yes | `postgresql://geraldos_admin:geraldos_secure_pass@postgres:5432/geraldos` | PostgreSQL connection pool string. |
| `AUTH_SECRET` | Yes | `[32+ byte random base64]` | HS256 JWT cookie signing secret (must NOT match dev default in production). |
| `DEV_AUTH` | No | `false` | Enables local dev admin login (`/api/auth/dev`). Strictly rejected in production. |
| `KEYCLOAK_URL` | Optional | `http://keycloak:8080` | Keycloak **backchannel** endpoint (server-side discovery + token exchange). When unset, the proxy fails closed in production (dev may opt in via `DEV_AUTH=true`). |
| `KEYCLOAK_PUBLIC_URL` | Optional | `http://localhost:8180` | Browser-facing Keycloak origin for the login redirect. Required when browsers reach Keycloak under a different host than the server (ADR-009). |
| `KEYCLOAK_REALM` | Optional | `geraldos` | Keycloak realm name. |
| `KEYCLOAK_CLIENT_ID` | Optional | `geraldos-frontend` | OIDC client identifier. |
| `KEYCLOAK_CLIENT_SECRET`| Optional | `[secret]` | OIDC client secret. Enforced when `KEYCLOAK_URL` is set. |
| `ORTHANC_URL` | Optional | `http://orthanc:8042` | Orthanc PACS REST URL (server-side only). |
| `ORTHANC_USERNAME` | Optional | `orthanc` | Orthanc HTTP basic auth user. |
| `ORTHANC_PASSWORD` | Optional | `orthanc_secure_pass` | Orthanc HTTP basic auth password. Never leaves the server. |
| `OHIF_URL` | Optional | `http://ohif:80` | OHIF container URL used for server-side health checks. |
| `OHIF_PUBLIC_URL` | Optional | `http://localhost:3001` | Browser-reachable OHIF origin exposed to the workstation iframe and CSP `frame-src`. Set this when `OHIF_URL` is only resolvable inside the Docker network. See §7 for the cookie-model constraint on cross-origin viewers. |
| `N8N_WEBHOOK_SECRET` | Production: Yes | `[random string]` | Shared secret inbound n8n callers must present in `x-n8n-webhook-secret`. Without it, production refuses webhooks with 503. |
| `REDIS_URL` | Optional | `redis://redis:6379` | Redis stream and distributed rate limiting connection string. |
| `MINIO_ENDPOINT` | Optional | `http://minio:9000` | MinIO S3 API endpoint. |
| `MINIO_ACCESS_KEY` | Optional | `geraldos` | MinIO root user / access key. |
| `MINIO_SECRET_KEY` | Optional | `geraldos-secret` | MinIO secret key. |
| `LOG_LEVEL` | No | `info` (`debug`, `info`, `warn`, `error`) | Application log verbosity. |

---

## 4. Production Container Build (`Dockerfile`)

The `Dockerfile` employs a 3-stage multi-stage build:
1. `deps`: Installs production and build dependencies via `npm ci`.
2. `builder`: Compiles Next.js standalone server (`npm run build`).
3. `runner`: Minimal Alpine Linux runtime with non-root user `nextjs` (UID 1001), copying only `.next/standalone`, `.next/static`, and `public/`.

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

---

## 7. Identity & Viewer Topology Requirements

### 7.1 Keycloak (production identity)
Production requires `KEYCLOAK_URL` (and `KEYCLOAK_CLIENT_SECRET`). The edge
proxy rejects all protected traffic with `503 IDENTITY_NOT_CONFIGURED`
(API) / a login redirect (pages) when no identity provider is configured.
Realm roles are read from `realm_access.roles` plus the client roles of
`KEYCLOAK_CLIENT_ID`; map at least `administrator`, `radiologist`,
`radiographer`, `receptionist`, `manager`, `finance`. Sessions are HS256 JWTs
signed with `AUTH_SECRET` — rotate it to invalidate every session.

When Keycloak publishes itself under a public hostname (set `KC_HOSTNAME`),
keep `KEYCLOAK_URL` pointing at the internal endpoint and set
`KEYCLOAK_PUBLIC_URL` to the browser-visible origin; token issuer validation
follows OIDC discovery automatically.

### 7.2 Embedded OHIF viewer (cookie model constraint)
The workstation embeds OHIF from `OHIF_PUBLIC_URL`. Because the GeraldOS session
cookie is `SameSite=Lax`, an OHIF instance served from a DIFFERENT origin cannot
attach the session cookie when calling `/api/orthanc/dicom-web` — the browser
withholds it on cross-site XHR by design. Deployments that want the embedded
full viewer must serve OHIF from the SAME public origin as GeraldOS (reverse
proxy co-location, e.g. Traefik routing `/viewer/*` → ohif built with
`PUBLIC_URL=/viewer/`). Otherwise use the imaging page's same-origin series
inspection, which works through `/api/orthanc/proxy` with normal auth.

### 7.3 Inbound n8n webhooks
Set `N8N_WEBHOOK_SECRET` and configure the matching header in every n8n flow
that calls `POST /api/webhooks/n8n`. Requests without the correct secret are
rejected with 401; production refuses unauthenticated webhooks outright.
