# GeraldOS Known Issues & Diagnostic Log

This document catalogues all known issues, validation warnings, and diagnostic
findings identified during repository audits. Resolved entries are retained as
diagnostic history with their remediation recorded.

---

## RESOLVED

### 1. `src/lib/env.ts` empty-string fallback (`??` vs `||`) — FIXED

- **Symptom**: `__tests__/lib/env-secrets.test.ts` failed — `AUTH_SECRET=""` in
  development returned `""` instead of the documented dev-secret fallback, while
  production incorrectly reported the dev-default error instead of "missing".
- **Root Cause**: `process.env[name] ?? fallback ?? ""` — nullish coalescing does
  not treat `""` as unset.
- **Remediation**: `resolveEnv` now treats blank/undefined values as unset:
  production fails fast ("Missing required environment variable"), development
  applies the fallback. Validated by `__tests__/lib/env-secrets.test.ts` (10/10).

### 2. Vitest native config warning — FIXED

- **Symptom**: `configLoader: 'native'` warnings on every test run.
- **Remediation**: Renamed `vitest.config.ts` → `vitest.config.mts` and replaced
  `__dirname` with `import.meta.dirname`. Test output is now clean.

### 3. Fail-open report signing guard — FIXED

- **Location**: `src/app/api/reports/[id]/route.ts`.
- **Issue**: `roles.some(r => /radiolog/i.test(r)) || roles.length === 0` allowed
  a session with an EMPTY roles array to sign reports — a direct violation of the
  AI-safety invariant that only authenticated radiologists finalise reports.
- **Remediation**: Guard now fails closed; validated in
  `__tests__/routes/report-signing.test.ts`.

### 4. Unauthenticated decision-engine, knowledge & workstation-context routes — FIXED

- **Locations**: `src/app/api/decisions/route.ts`,
  `src/app/api/knowledge/route.ts`, `src/app/api/workstation/context/route.ts`.
- **Issue**: These routes performed no session/RBAC check of their own (they sat
  behind the edge proxy only). The decision engine is the AI safety core and the
  workstation context endpoint exposes patient clinical data.
- **Remediation**: Wrapped in `withAuth` with appropriate permissions
  (`ai-review.*`, `knowledge.*`, `workflow.read`). The knowledge POST path was
  also re-routed through the knowledge service per the service-layer rule.
  Validated in `__tests__/routes/previously-unauthed.test.ts`.

### 5. n8n inbound webhook had no authentication — FIXED

- **Location**: `src/app/api/webhooks/n8n/route.ts`.
- **Issue**: Comment claimed "authentication handled by webhook secret" but no
  secret check existed; any caller could write arbitrary audit entries.
- **Remediation**: `N8N_WEBHOOK_SECRET` header check (constant-time compare);
  production without a configured secret returns 503 fail-closed; development
  allows with a logged warning. Validated in
  `__tests__/routes/webhook-secret.test.ts`.

### 6. Spoofable identity in AI-safety audit trails — FIXED

- **Locations**: `src/app/api/ai-review/[id]/route.ts`,
  `src/app/api/decisions/[id]/route.ts`.
- **Issue**: `reviewedBy` / `approvedBy` were taken from the request body, so a
  user could attribute observation accept/reject or decision approve/execute to
  another person.
- **Remediation**: Attribution is bound to the verified session
  (`user.name || user.sub`). Validated in
  `__tests__/routes/ai-review-attribution.test.ts`.

### 7. DICOMweb proxy served without explicit session check — FIXED

- **Location**: `src/app/api/orthanc/dicom-web/[...path]/route.ts`.
- **Issue**: Relied solely on the edge proxy; also advertised
  `access-control-allow-origin: *` which is incoherent with cookie auth
  (browsers cannot send credentials under `*`), i.e. pure attack surface.
- **Remediation**: Explicit cookie verification before any Orthanc traffic;
  wildcard CORS headers and OPTIONS preflight removed. Validated in
  `__tests__/routes/dicom-web-auth.test.ts`.

### 8. Event bus could fan out before durable persistence — FIXED

- **Location**: `src/lib/events.ts`.
- **Issue**: Redis XADD ran BEFORE the Postgres `event_log` insert. A Postgres
  failure after a successful XADD left stream consumers notified of events the
  durable record (SSE feed source) never contained.
- **Remediation**: `event_log` insert first (durable record of truth), Redis
  fan-out second (best-effort). NOTE: full transactional outbox (domain row +
  event in one DB transaction) remains future work — see NEXT_STEPS.

### 9. Workflow transitions had no lost-update protection — FIXED

- **Location**: `src/lib/workflow.ts`.
- **Issue**: Read-guard-update sequence without optimistic concurrency: two
  concurrent transitions could both pass guards against the same observed stage.
- **Remediation**: UPDATE is conditional on the observed stage
  (`WHERE id = ? AND stage = ?`); 0 updated rows → HTTP 409. Validated in
  `__tests__/lib/workflow-concurrency.test.ts`.

### 10. SSE stream could permanently skip events — FIXED

- **Location**: `src/app/api/events/stream/route.ts`.
- **Issue**: Every poll read newest-first (`ORDER BY id DESC LIMIT 20`); more
  than 20 events between polls meant older ones were never delivered.
- **Remediation**: Once a cursor exists the poll walks forward in insertion
  order (`ORDER BY id ASC WHERE id > lastId`), so catch-up is gapless.

---

## OPEN

### O-1. Embedded OHIF viewer requires same-origin topology (P2)

The workstation embeds OHIF via iframe from `OHIF_PUBLIC_URL` while the session
cookie is `SameSite=Lax`. Cross-origin XHR from the OHIF iframe to the GeraldOS
DICOMweb proxy therefore cannot carry the session cookie, so the stock
`ohif/app:latest` container cannot authenticate against `/api/orthanc/dicom-web`
from a different port/origin. This is a browser cookie-model constraint, not a
code bug.

**Workarounds (in order of preference)**:

1. Deploy OHIF behind the same public origin as GeraldOS (reverse proxy
   co-location, e.g. Traefik/nginx routing `/` → app and `/viewer` → OHIF built
   with matching `PUBLIC_URL`). Everything is then same-origin and works today.
2. Use the imaging page's same-origin series inspection (works fully — it goes
   through `/api/orthanc/proxy` with `withAuth`).

The imaging page's thumbnails/preview flow is unaffected. See DEPLOYMENT.md.

### O-2. Transactional outbox not yet implemented (P2) — FIXED

Implemented (ADR-010): critical flows (workflow transitions, study creation,
decision engine propose/approve/reject/execute) now insert their `event_log`
rows inside the SAME database transaction as the domain mutation; the relay
drains unpublished rows to Redis with retry/backoff and stamps `published_at`.
Proven live by `__integration__/events.test.ts` (durability + Redis-outage
backlog drain). Residual: delivery is at-least-once — consumers must be
idempotent.

### O-3. `services/*.mjs` stubs are placeholders (P3)

`services/ohif.mjs`, `fhir.mjs`, etc. are minimal standalone fallback servers
for offline development. They are NOT production services and must never be
pointed at outside the standalone fallback mode. Real deployments use the Docker
images declared in docker-compose.yml.

### O-4. OIDC refresh/JWKS rotation untested against live Keycloak (P2) — RESOLVED

Full authorization-code flow now integration-tested against a live Keycloak
realm (`__integration__/auth.test.ts`, `docs/INTEGRATION_TESTS.md`), including
issuer validation, role attribution via the access token (ADR-011), forged-token
and zero-role fail-closed behaviour. Refresh-token rotation remains unexercised
(sessions are app-issued HS256; refresh is only needed for long-lived OHIF
embedded flows).

### 11. Keycloak OIDC identity layer — REMOVED (native auth)

- **Location**: `src/lib/auth/oidc.ts`, `/api/auth/callback`, Keycloak compose
  service + realm import, `KEYCLOAK_*` env vars.
- **Decision**: Native authentication (ADR-012): staff scrypt hashes in
  PostgreSQL + HS256 sessions. The OIDC code flow, JWKS verification and the
  Keycloak container were removed; `auth-origin.test.ts` and the OIDC-heavy
  integration helpers were rewritten for the native login flow.

### 12. Redis event fan-out + rate limiting — REMOVED (PostgreSQL-only)

- **Location**: `src/lib/redis.ts`, Redis compose services, `REDIS_URL`,
  ioredis dependency, relay in `src/lib/events.ts`.
- **Decision**: `event_log` is the only event bus (ADR-013); rate limiting is
  in-memory and bounded. `__integration__/events.test.ts` now proves durability
  + ordered reads against PostgreSQL only. Residual trade-off: per-instance
  rate-limit windows (see `walkthrough.md` → REMAINING RISKS).

### 13. MinIO / Dicoogle / HAPI FHIR / n8n / LangGraph — REMOVED (no production-critical consumers)

- **Locations**: `src/app/api/minio/*`, `src/app/api/dicoogle/*`,
  `src/app/api/fhir`, `src/app/api/n8n/*`, `src/app/api/webhooks/n8n`,
  `services/*.mjs`, `docker/{keycloak,dicoogle,ohif}`, `src/lib/agents.ts`
  tool text, `src/app/api/agents/chat` LangGraph branch.
- **Decision**: Orthanc is the authoritative DICOM store (no object storage or
  search index needed); in-app agents on PostgreSQL replace LangGraph; n8n
  webhooks and FHIR had no production-critical consumers. Tests for removed
  surfaces (`webhooks.test.ts`, `webhook-secret.test.ts`) were removed with
  them.

### 14. `dotenv` dependency — REMOVED

- **Location**: `vitest.integration.config.mts` used `dotenv` to load
  `.env.integration`.
- **Remediation**: Replaced with Node's built-in `process.loadEnvFile`
  (guarded by `existsSync`); the package and its lockfile entry were pruned.
