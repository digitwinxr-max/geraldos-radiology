# GeraldOS Architecture Decision Records (ADRs)

This document records the foundational architectural decisions, context, rationale, and non-negotiable constraints established during the 12 development phases of GeraldOS.

---

## ADR-001: Next.js 16 App Router as Unified Platform Runtime

- **Status**: Accepted & Authoritative.
- **Context**: GeraldOS requires tight orchestration of UI views, real-time feeds, secure PACS proxies, and background service communication.
- **Decision**: Standardise on Next.js 16 (App Router) using standalone container output (`output: 'standalone'`).
- **Consequences**:
  - Unified repository hosting frontend components, API controllers, and proxy middleware.
  - Server secrets (PACS credentials, database connection strings) are strictly protected within API route handlers and never leak to the client bundle.

---

## ADR-002: Thin Controllers, Rich Domain Service Layer

- **Status**: Accepted & Authoritative.
- **Context**: Direct database queries in API route handlers caused duplicate query logic and inconsistent business rule validation across endpoints.
- **Decision**: Extract all business logic, Drizzle queries, and domain calculations into `src/services/*`. Route handlers (`src/app/api/*`) act strictly as thin controllers responsible for authentication (`withAuth`), input parsing (`Zod`), query clamping (`src/lib/list-query.ts`), and error wrapping (`src/lib/api-error.ts`).
- **Consequences**: High testability via isolated unit tests and shared service operations between API routes and the AI Decision Engine.

---

## ADR-003: Non-Negotiable AI Safety Guardrails & Decision Engine

- **Status**: Accepted & Authoritative.
- **Context**: AI agents (reporting, triage, scheduling) must never perform high-risk clinical actions autonomously.
- **Decision**: Route all AI recommendations through the deterministic Decision Engine (`src/lib/decision-engine.ts`):
  $$\text{Recommendation} \longrightarrow \text{Business Rules} \longrightarrow \text{Validation} \longrightarrow \text{Approval} \longrightarrow \text{Execution} \longrightarrow \text{Audit}$$
- **Strict Invariants**:
  1. AI agents are strictly forbidden from signing or finalising radiology reports (`reports.status = 'final'`). Only authenticated human radiologists can sign reports.
  2. AI review candidate observations are suggestions only (`ai_observations.status = 'pending'`); they are never diagnoses and must be explicitly accepted or rejected by a radiologist.
  3. Autonomous STAT clinical priority changes require human verification.

---

## ADR-004: Client Data Layer with React Query & Typed API Client

- **Status**: Accepted & Authoritative.
- **Context**: Disparate client `fetch` calls led to uncoordinated polling, duplicate network requests, and stale cache issues across multi-panel workstation views.
- **Decision**: Centralise all client data fetching through TanStack React Query 5 with standardized query key factories (`src/lib/query-keys.ts`) and a typed HTTP client (`src/lib/api-client.ts`).
- **Consequences**: Predictable cache invalidation, unified loading/error UI primitives, and coordinated background polling (30s intervals).

---

## ADR-005: Fail-Closed Edge Proxy & Stateless Session Tokens

- **Status**: Accepted & Authoritative.
- **Context**: Platform security requires defense-in-depth against unauthorised route access and CSRF attacks.
- **Decision**:
  1. Implement Next.js 16 `src/proxy.ts` fail-closed middleware. In production, requests without a valid identity provider or session token are rejected.
  2. Store sessions as `httpOnly, sameSite=lax` HS256 JWT cookies.
  3. Require strict `Origin` and `Referer` headers on all mutating HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`).

---

## ADR-006: Dual-Mode Multi-Agent Runtime & Resilient Fallback

- **Status**: Accepted & Authoritative.
- **Context**: External AI services (LangGraph) may be unreachable or offline in certain deployment topologies.
- **Decision**: `src/lib/agents.ts` attempts dispatch to LangGraph API. If unreachable or unconfigured, it automatically falls back to an internal live PostgreSQL reasoning simulation that executes operational queries against the actual database.
- **Consequences**: GeraldOS remains fully interactive and functional in isolated or air-gapped environments.

---

## ADR-007: Fail-Closed Auxiliary Authentication Surfaces (Aug 2026 hardening)

- **Status**: Accepted & Implemented.
- **Context**: Several routes bypassed `withAuth` for technical reasons (raw
  binary/SSE responses, inbound webhooks) or predated the enforcement convention
  (`/api/decisions`, `/api/knowledge`, `/api/workstation/context`). The edge
  proxy alone was the only gate — acceptable while it is mandatory, but fragile
  against configuration drift and useless when `DEV_AUTH=true` bypasses it.
- **Decision**:
  1. Every route that returns raw streams/binary verifies the session cookie
     explicitly (SSE stream, DICOMweb proxy).
  2. Inbound machine-to-machine webhooks authenticate with a shared secret
     (`N8N_WEBHOOK_SECRET`, constant-time compared); production without a
     configured secret refuses with 503.
  3. All remaining routes use `withAuth`; identity attribution in audit trails
     (report signing, AI observation review, decision approval) always derives
     from the verified session token, never from request bodies.
- **Consequences**: Defense in depth no longer depends on a single middleware;
  spoofing an auditor in safety-critical records is impossible; dev convenience
  requires explicit opt-in.

---

## ADR-008: Event Durability Ordering — Durable Record First

- **Status**: Accepted & Implemented.
- **Context**: The event bus previously fanned out to Redis before persisting to
  `event_log`. A Postgres failure after a successful XADD produced events that
  stream consumers saw but the durable record (which feeds SSE and replay)
  never contained.
- **Decision**: `publishEvent` persists to `event_log` FIRST (record of truth),
  then fans out to Redis Streams best-effort. Replay always comes from Postgres.
- **Consequences**: Redis consumers may briefly see events whose durable insert
  later fails (logged loudly); the inverse — durable-record loss with successful
  fan-out — can no longer happen. Full transactional outbox remains future work
  (KNOWN_ISSUES O-2).

---

## ADR-009: Front-channel / Back-channel Split for Keycloak & OHIF URLs

- **Status**: Accepted & Implemented.
- **Context**: Compose deployments resolve services by internal hostnames
  (`keycloak:8080`, `ohif:80`) which browsers cannot reach. The login redirect
  and embedded viewer therefore broke in real deployments. Additionally,
  validating Keycloak ID tokens against our env-constructed issuer fails when
  Keycloak publishes itself under a public hostname (`KC_HOSTNAME`).
- **Decision**:
  - `KEYCLOAK_URL` = server-side backchannel (discovery, token exchange).
    `KEYCLOAK_PUBLIC_URL` (optional) = browser-facing front channel used for the
    authorization redirect.
  - ID-token verification validates against the issuer reported in OIDC
    discovery (the provider's own view), not our constructed URL.
  - `OHIF_URL` = server-side health target; `OHIF_PUBLIC_URL` (optional) =
    browser-facing origin exposed via `publicClientConfig()` and admitted by CSP
    `frame-src`.
- **Consequences**: Browser traffic always targets reachable origins while
  server-to-server traffic stays on the internal network; issuer validation is
  correct under split-horizon DNS.

---

## ADR-010: Transactional Outbox for Domain Events (implemented)

- **Status**: Accepted & Implemented.
- **Context**: ADR-008 left "full transactional outbox" as future work: a domain
  mutation could commit while its `event_log` insert (a separate write) failed,
  losing the event. Conversely the relay could re-deliver after a crash between
  commit and fan-out.
- **Decision**: Critical flows (workflow transitions, study creation, decision
  engine propose/approve/reject/execute) write their events inside the SAME
  database transaction as the mutation (`recordEventInTransaction`). The relay
  (`src/lib/events.ts`, kicked from `instrumentation.ts`) drains
  `published_at IS NULL` rows to Redis Streams with retry/backoff and stamps
  `published_at`. SSE falls back to polling `event_log`, so durability never
  depends on Redis availability.
- **Consequences**: `event_log` is now the single record of truth; Redis is a
  pure transport. Replay = reset `published_at`. The known residual gap is
  narrowed to at-least-once delivery (consumers must tolerate duplicates).

---

## ADR-011: Realm Roles Sourced From the Verified Access Token

- **Status**: Accepted & Implemented (found via live integration testing).
- **Context**: Session creation extracted roles from the ID-token claims.
  Against real Keycloak (v26, realm import) every login produced an empty role
  set — Keycloak issues ID tokens WITHOUT `realm_access`; realm and client roles
  live only in the ACCESS token. Unit tests missed this because they mocked
  token claims directly. Silent zero-role sessions would have locked out every
  real user (fail-closed, but total).
- **Decision**:
  - Identity (`sub`, `name`, `email`) continues to come from the verified ID
    token (`aud` = client id).
  - Roles are unioned from: ID-token claims (backward compatible with realms
    that map them there) and the verified ACCESS token (`verifyAccessTokenRoles`
    — full JWKS signature + issuer verification; no `aud` pin because access
    tokens target the `account` audience).
- **Consequences**: Role attribution works across Keycloak versions regardless
  of where the provider places `realm_access`. Forged/mistoken access tokens
  are rejected before their claims are read.

---

## ADR-012: Native Authentication on PostgreSQL Staff Records (supersedes ADR-005 §1, ADR-009, ADR-011)

- **Status**: Accepted & Implemented (lean-production refactor).
- **Context**: Keycloak OIDC was the identity layer: a separate container, a
  realm import, OIDC discovery/token-exchange/JWKS verification in
  `src/lib/auth/oidc.ts`, and a browser redirect dance through
  `/api/auth/callback`. Staff identity and roles already live in the GeraldOS
  `staff` table. The realm import carried no production users; every real
  deployment needed a second identity system to manage, secure, and back up —
  with no platform benefit.
- **Decision**: Remove Keycloak/OIDC entirely. Authentication is native:
  1. `staff.password_hash` stores `scrypt$N$r$p$<salt>$<key>` (16-byte random
     salt, 64-byte derived key, `crypto.scrypt`, `timingSafeEqual` verify).
  2. `POST /api/auth/login` verifies credentials against PostgreSQL and issues
     the existing HS256 session cookie (`AUTH_SECRET`); roles come from the
     staff member's `role` column (RBAC unchanged).
  3. `/api/auth/logout` clears the cookie; `/api/auth/me` reads the session;
     the dev bypass requires `DEV_AUTH=true` and is impossible in production.
- **Consequences**: One less external system to operate; credentials never
  leave PostgreSQL; fail-closed edge proxy behaviour retained (401/redirect;
  dev-only 503 when no auth path configured). Sessions are still HS256 JWTs —
  rotating `AUTH_SECRET` invalidates them all.

## ADR-013: PostgreSQL-Only Event Bus (supersedes ADR-008, ADR-010)

- **Status**: Accepted & Implemented (lean-production refactor).
- **Context**: Redis Streams was the fan-out transport: `publishEvent` XADDed
  to `geraldos:events` and a relay drained `published_at IS NULL` rows. The
  durable record (`event_log`) and the SSE stream already read PostgreSQL
  directly; Redis added a second store to run, monitor, and back up, while
  SSE consumers still polled the table.
- **Decision**: Remove Redis. `event_log` is the sole event bus:
  - `recordEventInTransaction(tx, …)` persists atomically with the domain
    mutation (transactional outbox — ADR-010's guarantee, no relay needed).
  - `publishEvent` is the best-effort path for non-critical flows.
  - `/api/events/stream` reads the table with an ordered cursor (exactly-once
    per client cursor). Rate limiting is in-memory (bounded 10k keys).
- **Consequences**: At-least-once delivery is inherent (consumers re-read rows;
  idempotent domain effects unchanged). `publish_attempts` /
  `last_publish_error` remain as legacy audit columns; the
  `event_log_pending_idx` index was dropped in migration `0002_native_auth`.

## ADR-014: Lean Production Infrastructure Topology

- **Status**: Accepted & Implemented (lean-production refactor).
- **Context**: The platform previously defined Keycloak, Redis, MinIO, HAPI
  FHIR, Dicoogle, n8n and LangGraph as compose services with client/server
  code paths, health probes and docs. Dependency tracing (see `walkthrough.md`
  → REMOVED) showed none of them carried production-critical load that the
  retained stack does not already provide:
  - Orthanc remains authoritative for DICOM storage/DICOMweb (replaces the
    MinIO + Dicoogle roles).
  - PostgreSQL `staff` + HS256 sessions replace Keycloak (ADR-012).
  - PostgreSQL `event_log` replaces Redis streams (ADR-013).
  - In-app agents on PostgreSQL replace the LangGraph runtime; n8n and HAPI
    FHIR had no production-critical consumers (probe/text references only).
- **Decision**: Target topology is app + PostgreSQL + Orthanc + OHIF.
  Removed: `services/{keycloak,fhir,dicoogle,n8n,ohif,langgraph,start-all}`,
  `docker/{keycloak,dicoogle,ohif}`, MinIO routes/lib, FHIR/Dicoogle/n8n
  routes, `src/lib/auth/oidc.ts`, `src/lib/redis.ts`, ioredis/aws4fetch/dotenv
  dependencies. Deployment files (`docker-compose*.yml`, `render.yaml`,
  `Dockerfile`, `.env.example`, CI) were aligned to the same topology.
- **Consequences**: A smaller, auditable surface; the walkthrough REMAINING
  RISKS section records the trade-offs (per-instance rate-limit windows,
  multi-instance deployments need front-proxy stickiness; OHIF iframe cookie
  constraints are unchanged).
