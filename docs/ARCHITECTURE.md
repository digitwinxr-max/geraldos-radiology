# GeraldOS Platform Architecture

GeraldOS is an AI-native Diagnostic Imaging Operations Orchestration Platform engineered for Gerald Holdings Medical Diagnostic Imaging (Botswana). It functions as the operational and intelligence layer positioned directly above the clinical imaging stack.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GeraldOS Presentation Layer                       │
│  Next.js 16 App Router · React 19 · TanStack Query · Tailwind CSS 4 · Radix  │
│  Dashboard · Reception · Scheduling · Workflow · Workstation · Review · AI  │
├─────────────────────────────────────────────────────────────────────────────┤
│                          Edge & Middleware Layer                            │
│  Next.js Proxy Convention (Fail-Closed) · Session JWT (HS256) · CSRF Origin │
│  In-memory Bounded Rate Limiting · Structured Async Local Storage           │
├─────────────────────────────────────────────────────────────────────────────┤
│                         Service & Domain Logic Layer                        │
│  12 Domain Services · Decision Engine · 9 AI Agents · Event Bus (PG outbox) │
│  Zod Schema Validation · Standardized Result & API Error Envelope          │
├───────────────────────────────┬─────────────────────────────────────────────┤
│      Internal Data Layer      │           External Integration Layer        │
│  PostgreSQL 16 via Drizzle ORM│  Orthanc DICOMweb (authoritative DICOM)     │
│  staff · event_log · audit    │  OHIF Viewer (deep links)                   │
│  (no Redis, no MinIO)         │  (no Keycloak, FHIR, Dicoogle, n8n, LangGraph)│
└───────────────────────────────┴─────────────────────────────────────────────┘
```

---

## 1. System Topology & Tiering

### 1.1 Presentation Layer (Client)
- **Framework**: Next.js 16 App Router, React 19.
- **Client State**: TanStack React Query 5 managing server-state caching, automatic background polling (30s intervals for operational data), and cache invalidation via standardized query key factories (`src/lib/query-keys.ts`).
- **UI Architecture**: Modular component hierarchy composed of:
  - Core UI primitives (`src/components/ui/`) enforcing consistent design tokens, states, and accessibility (WCAG 2.1 AA baseline).
  - Radiologist Workstation (`src/components/workstation/`) featuring multi-panel layout: Worklist, PACS DICOM Viewer iframe, Clinical Context, AI Review Overlay, Report Editor, and Activity Log.
  - Global Shell & Command Palette (`src/components/command-palette.tsx`, `src/components/notification-centre.tsx`).

### 1.2 Edge, Proxy & Security Layer
- **Edge Routing**: Next.js 16 `src/proxy.ts` (proxy convention) implements fail-closed route gating: protected traffic without a valid session gets 401 (API) or a login redirect (pages); production never runs without an authentication path.
- **Authentication (native)**: `POST /api/auth/login` verifies staff credentials against PostgreSQL (`src/lib/auth/native-auth.ts`) using scrypt hashes (`src/lib/auth/password.ts`, timing-safe compare), then issues a stateless, `httpOnly`, `sameSite=lax`, Secure-in-production HS256 session cookie (`AUTH_SECRET`). Logout clears the cookie. Dev bypass (`DEV_AUTH=true`) is strictly non-production.
- **CSRF Protection**: Strict Origin and Referer validation on all mutating HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`).
- **Rate Limiting**: Fixed-window in-memory limiter (bounded at 10k keys) applied to sensitive routes (`/api/auth/*`, `/api/agents/chat`, `/api/seed`).
- **Security Headers**: Content-Security-Policy (CSP) tailored for App Router scripts and OHIF iframe embedding, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.

### 1.3 Service & Intelligence Layer
- **Service Layer**: 12 modular domain services (`src/services/`) encapsulating Drizzle ORM operations, transaction handling, and domain business rules. Route handlers remain thin controllers.
- **Decision Engine (`src/lib/decision-engine.ts`)**: Structured AI action pipeline:
  $$\\text{Recommendation} \\longrightarrow \\text{Business Rules} \\longrightarrow \\text{Validation} \\longrightarrow \\text{Approval} \\longrightarrow \\text{Execution} \\longrightarrow \\text{Audit}$$
  - Enforces non-negotiable safety guardrails: AI can never autonomously sign/finalise radiology reports, issue final diagnoses, or trigger unauthorised STAT clinical actions.
- **Multi-Agent Runtime (`src/lib/agents.ts`)**: 9 specialised operational agents (Reception, Scheduling, Workflow, Reporting, Equipment, Inventory, Quality Assurance, Executive Intelligence, Knowledge) operating directly on PostgreSQL operational data. AI output is assistive; the radiologist is the final decision-maker.
- **Event Bus (`src/lib/events.ts`)**: PostgreSQL-native outbox. Critical domain flows insert their event in the same transaction as the mutation (`recordEventInTransaction`); `/api/events/stream` reads `event_log` directly with an ordered cursor. No broker.

### 1.4 Persistence & External Integration Layer
- **Primary Database**: PostgreSQL 16 managed via Drizzle ORM (`src/db/schema.ts`) — the authoritative store for staff, patients, referrals, scheduling, workflow, reports, billing, events and audit.
- **PACS / DICOM Engine**: Orthanc DICOM server — authoritative for DICOM objects — proxied server-side via `/api/orthanc/*`; uploads at `/api/orthanc/upload`; DICOMweb via `/api/orthanc/dicom-web`.
- **Viewer**: OHIF Web Viewer mounted same-origin at `/viewer` by the app edge
  proxy (`scripts/edge-proxy.mjs`; deep links `${PUBLIC_APP_URL}/viewer/viewer?StudyInstanceUIDs=<uid>`).

---

## 2. Component Boundaries & Dependencies

| Layer | Primary Location | Permitted Inbound Dependencies | Prohibited Dependencies |
|---|---|---|---|
| **Presentation** | `src/app/*`, `src/components/*`, `src/hooks/*` | User interactions, React Query | Direct DB queries, server secrets, private service keys |
| **API Controllers** | `src/app/api/*` | Frontend requests | Raw SQL strings, inline business rule duplication |
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
Agent / User Prompt ──► In-app Agent Runtime (PostgreSQL data)
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
   - `GET /api/health`: Readiness and liveness probe checking PostgreSQL latency, process uptime, memory RSS, and node version.
   - `GET /api/metrics`: In-memory request counters, HTTP status code distribution (2xx, 3xx, 4xx, 5xx), per-route request statistics, and latency histograms.
   - `GET /api/integrations/status`: Real-time health, connectivity, and latency for the two external services (Orthanc, OHIF).
