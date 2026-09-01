# GeraldOS Dependency & Authority Map

This document establishes the authoritative source files, consumer relationships, extension points, and deprecation candidates across the GeraldOS codebase.

---

## 1. Authority Map by Architectural Concern

| Architectural Concern | Authoritative Source File(s) | Primary Consumers | Purpose & Extension Points |
|---|---|---|---|
| **Database Schema** | `src/db/schema.ts` | All `src/services/*`, `src/lib/seed-new-modules.ts` | Single source of truth for Drizzle ORM table models, relations, column constraints, and types. |
| **Database Client** | `src/db/index.ts` | All `src/services/*` | Single PostgreSQL connection pool instance configured with connection timeouts and schema export. |
| **Password Hashing** | `src/lib/auth/password.ts` | `src/lib/auth/native-auth.ts`, staff provisioning/seed | scrypt (16-byte salt, 64-byte key) hashing + timing-safe verification; stored `scrypt$N$r$p$salt$key`. |
| **Native Authentication** | `src/lib/auth/native-auth.ts` | `src/app/api/auth/login/route.ts` | `authenticateStaff(email, password)` against PostgreSQL staff records; fail-closed generic 401. |
| **Sessions** | `src/lib/auth/session.ts` | `src/proxy.ts`, all `/api/auth/*` routes, SSE stream | HS256 signed session JWTs (`AUTH_SECRET`) with HttpOnly/Secure/SameSite cookies. |
| **API Envelope & Errors** | `src/lib/api-error.ts` | All `src/app/api/*` route handlers | Standard error responses (`{ error: { code, message } }`). Never expose internal database errors or stack traces to clients. |
| **Query Parameters & Pagination** | `src/lib/list-query.ts` | All collection API route handlers | Extracts, clamps (`pageSize` max 200), and validates sort fields against explicit whitelists. |
| **Validation Schemas** | `src/lib/validation.ts` | All mutating API route handlers (`POST`, `PATCH`, `PUT`) | Zod schemas for all domain entities; single source for client/server validation consistency. |
| **Role-Based Access (RBAC)** | `src/lib/rbac.ts` | `src/lib/middleware-helpers.ts` (`withAuth`), UI permission checks | Defines system roles (`admin`, `radiologist`, `radiographer`, `receptionist`, `nurse`, `finance`, `auditor`) and granular permission flags. |
| **Request Tracing & Auth Middleware** | `src/lib/middleware-helpers.ts` | All protected API routes (`src/app/api/*`) | `withAuth` wrapper executing AsyncLocalStorage request context, RBAC check, timing, and error envelope wrapping. |
| **Edge Routing & Proxy** | `src/proxy.ts` | Next.js 16 Edge runtime | Global request interceptor implementing fail-closed security gating and public route bypass. |
| **Rate Limiting** | `src/lib/rate-limit.ts` | `/api/auth/*`, `/api/agents/chat`, others | Fixed-window in-memory limiter (bounded at 10k keys) with per-IP bucket keys. |
| **Event Bus (Outbox)** | `src/lib/events.ts` | All domain services, `/api/events`, `/api/events/stream` | Durable `event_log` rows; transactional outbox via `recordEventInTransaction`; SSE reads the table directly. |
| **Client Data Layer (API Client)** | `src/lib/api-client.ts` | All `src/hooks/use-*.ts` | Fetch wrapper adding session credentials, CSRF headers, and standard error parsing. |
| **React Query Cache Keys** | `src/lib/query-keys.ts` | All `src/hooks/use-*.ts` | Centralised query key factory preventing cache collision and enabling targeted cache invalidation. |
| **UI Primitives** | `src/components/ui/*` | All page components (`src/app/*`) | 16 base UI components adhering to design tokens, keyboard accessibility, and ARIA guidelines. |
| **AI Decision Engine** | `src/lib/decision-engine.ts` | `src/services/decisions-service.ts`, `src/lib/agents.ts` | Multi-step safety evaluation and audit pipeline for all autonomous AI actions. |
| **Observability & Logging** | `src/lib/logger.ts`, `src/lib/metrics.ts` | Entire platform | JSON structured logger with request enrichment; in-memory Prometheus-style metrics engine. |
| **Integrations** | `src/lib/integrations/index.ts` | `/api/integrations/status`, Settings page | Orthanc (DICOMweb proxy) and OHIF (viewer) probes + browser-safe public config. |

---

## 2. Authority Map by Runtime Component

| Component | Authoritative Production Implementation | Notes |
|---|---|---|
| **Identity & Sessions** | Native: PostgreSQL `staff` + scrypt hashes + HS256 session (`src/lib/auth/*`) | No external identity provider. Dev bypass (`/api/auth/dev`) is strictly disabled in production. |
| **PACS / DICOM Engine** | Orthanc Docker container (`orthancteam/orthanc`, `docker/orthanc/orthanc.json`) | Proxied via `/api/orthanc/*` so PACS credentials remain server-side. |
| **Viewer** | OHIF (`OHIF_URL` / `OHIF_PUBLIC_URL`) | Deep links from study rows: `${OHIF_URL}/viewer?StudyInstanceUIDs=<uid>`. |
| **Event Bus** | PostgreSQL `event_log` (transactional outbox + SSE cursor) | No broker. `publish_attempts`/`last_publish_error` retained as legacy audit columns. |
| **Storage Engine** | Orthanc is authoritative for DICOM objects | No object-store layer. |
| **AI Agent Runtime** | In-app live-data agents (`src/lib/agents.ts`) on PostgreSQL | AI is assistive; Decision Engine gates execution; radiologist signs. |

---

## 3. Deprecation & Removal Candidates

1. `services/` root directory previously held mock node scripts (`dicoogle.mjs`, `fhir.mjs`, `keycloak.mjs`, `n8n.mjs`, `ohif.mjs`, `langgraph_agent.py`, `start-all.sh`). All were **removed** with the lean-production refactor; only `services/orthanc.json` remains (Orthanc config).
2. `docker/` previously held `keycloak/geraldos-realm.json`, `dicoogle/`, and `ohif/nginx.conf` — **removed**; only `docker/orthanc/` remains.
3. `dicom-samples/`: Local CT DICOM sample files for Orthanc ingestion testing.
   - **Status**: Authoritative demo test data. Retain for test suite and seeding.
