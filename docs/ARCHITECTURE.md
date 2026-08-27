# GeraldOS Platform Architecture

GeraldOS is an AI-native Diagnostic Imaging Operations Orchestration Platform engineered for Gerald Holdings Medical Diagnostic Imaging (Botswana). It functions as the operational and intelligence layer positioned directly above the clinical imaging and infrastructure stack.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GeraldOS Presentation Layer                       │
│  Next.js 16 App Router · React 19 · TanStack Query · Tailwind CSS 4 · Radix  │
│  Dashboard · Reception · Scheduling · Workflow · Workstation · Review · AI  │
├─────────────────────────────────────────────────────────────────────────────┤
│                          Edge & Middleware Layer                            │
│  Next.js Proxy Convention (Fail-Closed) · Session JWT (HS256) · CSRF Origin │
│  Redis-backed Distributed Rate Limiting · Structured Async Local Storage    │
├─────────────────────────────────────────────────────────────────────────────┤
│                         Service & Domain Logic Layer                        │
│  12 Domain Services · Decision Engine · 9 AI Agents · Event Bus (Redis)     │
│  Zod Schema Validation · Standardized Result & API Error Envelope          │
├───────────────────────────────┬─────────────────────────────────────────────┤
│      Internal Data Layer      │           External Integration Layer        │
│  PostgreSQL 16 via Drizzle ORM│  Keycloak OIDC · Orthanc DICOMweb · OHIF    │
│  Redis Streams & Caching      │  HAPI FHIR R4 · Dicoogle · n8n · MinIO S3   │
│  Event Log & Audit Log        │  LangGraph Agent Runtime (w/ Fallback)     │
└───────────────────────────────┴─────────────────────────────────────────────┘
```

---

## 1. System Topology & Tiering

### 1.1 Presentation Layer (Client)
- **Framework**: Next.js 16.2.6 App Router, React 19.2.6.
- **Client State**: TanStack React Query 5.101.4 managing server-state caching, automatic background polling (30s intervals for operational data), and cache invalidation via standardized query key factories (`src/lib/query-keys.ts`).
- **UI Architecture**: Modular component hierarchy composed of:
  - 16 Core UI primitives (`src/components/ui/`) enforcing consistent design tokens, states, and accessibility (WCAG 2.1 AA baseline).
  - Radiologist Workstation (`src/components/workstation/`) featuring multi-panel layout: Worklist, PACS DICOM Viewer iframe, Clinical Context, AI Review Overlay, Report Editor, and Activity Log.
  - Global Shell & Command Palette (`src/components/command-palette.tsx`, `src/components/notification-centre.tsx`).

### 1.2 Edge, Proxy & Security Layer
- **Edge Routing**: Next.js 16 `src/proxy.ts` (replacing legacy middleware convention) implements fail-closed route gating.
- **Authentication**: Stateless, `httpOnly`, `sameSite=lax` HS256 JWT session cookies (`AUTH_SECRET`). Keycloak OIDC authorization code flow verifies JWKS. In development, opt-in bypass (`DEV_AUTH=true`) provides local admin access.
- **CSRF Protection**: Strict Origin and Referer validation on all mutating HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`).
- **Rate Limiting**: Distributed sliding/fixed-window rate limiting backed by Redis (with memory fallback), applied to sensitive routes (`/api/auth/*`, `/api/webhooks/n8n`, `/api/agents/chat`, `/api/seed`).
- **Security Headers**: Content-Security-Policy (CSP) tailored for App Router scripts and OHIF iframe embedding, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.

### 1.3 Service & Intelligence Layer
- **Service Layer**: 12 modular domain services (`src/services/`) encapsulating Drizzle ORM operations, transaction handling, and domain business rules. Route handlers remain thin controllers.
- **Decision Engine (`src/lib/decision-engine.ts`)**: Structured AI action pipeline:
  $$\text{Recommendation} \longrightarrow \text{Business Rules} \longrightarrow \text{Validation} \longrightarrow \text{Approval} \longrightarrow \text{Execution} \longrightarrow \text{Audit}$$
  - Enforces non-negotiable safety guardrails: AI can never autonomously sign/finalise radiology reports, issue final diagnoses, or trigger unauthorised STAT clinical actions.
- **Multi-Agent Runtime (`src/lib/agents.ts`)**: 9 specialised operational agents (Reception, Scheduling, Workflow, Reporting, Equipment, Inventory, Quality Assurance, Executive Intelligence, Knowledge) with tool execution and resilient PostgreSQL simulation fallback when LangGraph is offline.
- **Event Bus (`src/lib/events.ts`)**: Redis Streams publisher (`XADD geraldos:events`) with automatic persistence into the PostgreSQL `event_log` table for auditability and real-time Server-Sent Events (SSE).

### 1.4 Persistence & External Integration Layer
- **Primary Database**: PostgreSQL 16 managed via Drizzle ORM (`src/db/schema.ts`).
- **Object Storage**: MinIO S3-compatible storage with SigV4 client-side presigned PUT uploads (`src/lib/integrations/minio.ts`).
- **PACS / DICOM Engine**: Orthanc DICOM server with DICOMweb proxy (`/api/orthanc/*`).
- **Viewer**: OHIF Web Viewer embedded via deep-link iframe.
- **Interoperability**: HAPI FHIR R4 proxy (`/api/fhir`) and Dicoogle PACS indexer (`/api/dicoogle/search`).
- **Workflow Automation**: n8n outbound trigger and inbound webhook dispatcher (`/api/webhooks/n8n`).

---

## 2. Component Boundaries & Dependencies

| Layer | Primary Location | Permitted Inbound Dependencies | Prohibited Dependencies |
|---|---|---|---|
| **Presentation** | `src/app/*`, `src/components/*`, `src/hooks/*` | User interactions, React Query | Direct DB queries, server secrets, private service keys |
| **API Controllers** | `src/app/api/*` | Frontend requests, external webhooks | Raw SQL strings, inline business rule duplication |
| **Domain Services** | `src/services/*` | API controllers, AI Decision Engine | React hooks, client-side UI components, HTTP Request objects |
| **Platform Libraries** | `src/lib/*` | Services, API controllers, Proxy | React UI components |
| **Database Schema** | `src/db/schema.ts`, `src/db/index.ts` | Services, Migration tooling | Direct exposure to presentation layer |

---

## 3. Data Flow Architecture

### 3.1 Standard Query Flow
```
User Action / Auto-Poll
       │
       ▼
React Hook (useQuery) ──► Typed API Client (src/lib/api-client.ts)
                                │
                                ▼
                        Proxy Middleware (Auth & CSRF Gate)
                                │
                                ▼
                        API Route Handler (src/app/api/*)
                                │ (withAuth / parseQuery)
                                ▼
                        Domain Service (src/services/*)
                                │
                                ▼
                        PostgreSQL (via Drizzle ORM)
                                │
                                ▼
                        Standard Envelope { data, meta: { page, pageSize, total } }
```

### 3.2 AI Decision & Action Execution Flow
```
Agent / User Prompt ──► LangGraph Runtime (or Live DB Simulation)
                                │
                                ▼
                        AI Recommendation Generated
                                │
                                ▼
                        Decision Engine (src/lib/decision-engine.ts)
                                │ 1. Safety Rule Evaluation
                                │ 2. Parameter Validation
                                ▼
                        Status: "proposed" | "validated"
                                │
                        [Radiologist / Manager Approval]
                                │
                                ▼
                        Execution via Domain Service
                                │
                                ▼
                        Event Logged & Audit Trail Written
```

---

## 4. Observability & Tracing

1. **Structured JSON Logging (`src/lib/logger.ts`)**: Every log line is formatted as a single JSON object containing timestamp (`ts`), log level (`level`), message (`msg`), request identifier (`requestId`), HTTP method, path, response status, duration in milliseconds, and authenticated `userId`.
2. **Request Context Tracing (`src/lib/request-context.ts`)**: Utilises Node.js `AsyncLocalStorage` to propagate request IDs and telemetry seamlessly across asynchronous service calls without parameter pollution.
3. **Container Probes**:
   - `GET /api/health`: Comprehensive readiness and liveness probe checking PostgreSQL latency, process uptime, memory RSS, and node version.
   - `GET /api/metrics`: In-memory request counters, HTTP status code distribution (2xx, 3xx, 4xx, 5xx), per-route request statistics, and latency histograms.
   - `GET /api/integrations/status`: Real-time health, connectivity, and latency monitoring for all 8 external services (Keycloak, Orthanc, OHIF, FHIR, Dicoogle, n8n, LangGraph, MinIO, Redis).
