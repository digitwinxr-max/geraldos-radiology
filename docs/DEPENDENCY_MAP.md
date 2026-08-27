# GeraldOS Dependency & Authority Map

This document establishes the authoritative source files, consumer relationships, extension points, and deprecation candidates across the GeraldOS codebase.

---

## 1. Authority Map by Architectural Concern

| Architectural Concern | Authoritative Source File(s) | Primary Consumers | Purpose & Extension Points |
|---|---|---|---|
| **Database Schema** | `src/db/schema.ts` | All `src/services/*`, `src/lib/seed-new-modules.ts` | Single source of truth for Drizzle ORM table models, relations, column constraints, and types. |
| **Database Client** | `src/db/index.ts` | All `src/services/*` | Single PostgreSQL connection pool instance configured with connection timeouts and schema export. |
| **API Envelope & Errors** | `src/lib/api-error.ts` | All `src/app/api/*` route handlers | Standard error responses (`{ error: { code, message } }`). Never expose internal database errors or stack traces to clients. |
| **Query Parameters & Pagination** | `src/lib/list-query.ts` | All collection API route handlers | Extracts, clamps (`pageSize` max 200), and validates sort fields against explicit whitelists. |
| **Validation Schemas** | `src/lib/validation.ts` | All mutating API route handlers (`POST`, `PATCH`, `PUT`) | Zod schemas for all domain entities; single source for client/server validation consistency. |
| **Role-Based Access (RBAC)** | `src/lib/rbac.ts` | `src/lib/middleware-helpers.ts` (`withAuth`), UI permission checks | Defines system roles (`admin`, `radiologist`, `radiographer`, `receptionist`, `nurse`, `finance`, `auditor`) and granular permission flags. |
| **Request Tracing & Auth Middleware** | `src/lib/middleware-helpers.ts` | All protected API routes (`src/app/api/*`) | `withAuth` wrapper executing AsyncLocalStorage request context, RBAC check, timing, and error envelope wrapping. |
| **Edge Routing & Proxy** | `src/proxy.ts` | Next.js 16 Edge runtime | Global request interceptor implementing fail-closed security gating and public route bypass. |
| **Client Data Layer (API Client)** | `src/lib/api-client.ts` | All `src/hooks/use-*.ts` | Fetch wrapper adding session credentials, CSRF headers, and standard error parsing. |
| **React Query Cache Keys** | `src/lib/query-keys.ts` | All `src/hooks/use-*.ts` | Centralised query key factory preventing cache collision and enabling targeted cache invalidation. |
| **UI Primitives** | `src/components/ui/*` | All page components (`src/app/*`) | 16 base UI components adhering to design tokens, keyboard accessibility, and ARIA guidelines. |
| **AI Decision Engine** | `src/lib/decision-engine.ts` | `src/services/decisions-service.ts`, `src/lib/agents.ts` | Multi-step safety evaluation and audit pipeline for all autonomous AI actions. |
| **Observability & Logging** | `src/lib/logger.ts`, `src/lib/metrics.ts` | Entire platform | JSON structured logger with request enrichment; in-memory Prometheus-style metrics engine. |

---

## 2. Mock vs Production Authority

| Component | Authoritative Production Implementation | Local / Staging Mock Alternative | Notes |
|---|---|---|---|
| **Identity Provider** | Keycloak OIDC (`src/lib/auth/oidc.ts`, `services/keycloak.mjs`) | Dev Auth Bypass (`src/app/api/auth/dev/route.ts`) | Dev login is strictly disabled in production (`NODE_ENV=production`). |
| **PACS / DICOM Engine** | Orthanc Docker container (`orthancteam/orthanc`) | Mock Orthanc server (`services/orthanc.json`) | Proxied via `/api/orthanc/*` so PACS credentials remain server-side. |
| **AI Agent Orchestrator** | LangGraph API (`langchain/langgraph-api`) | Live PostgreSQL Agent Simulation (`src/lib/agents.ts`) | When LangGraph is unreachable, GeraldOS runs local operational reasoning against the live DB seamlessly. |
| **Event Bus** | Redis 7 (`redis:7` via ioredis) | In-memory fallback + Postgres `event_log` | Platform functions fully even without Redis, persisting all events to PostgreSQL. |
| **Storage Engine** | MinIO S3 (`minio/minio`) | Local static directory (`public/`) | Production presigns S3 PUT URLs directly for clients. |

---

## 3. Deprecation & Removal Candidates

1. `services/` root directory contains mock node scripts (`dicoogle.mjs`, `fhir.mjs`, `keycloak.mjs`, `n8n.mjs`, `ohif.mjs`, `langgraph_agent.py`, `start-all.sh`).
   - **Status**: Retained as developer sandbox fixtures for offline testing when Docker is unavailable.
   - **Action**: DO NOT delete; isolate under developer tooling.
2. `dicom-samples/`: Local CT DICOM sample files for Orthanc ingestion testing.
   - **Status**: Authoritative demo test data. Retain for test suite and seeding.
