# GeraldOS — AI-Native Diagnostic Imaging Operations Platform

Internal operations orchestration platform for Gerald Holdings Medical Diagnostic Imaging.
GeraldOS sits **above** the imaging stack: it orchestrates patients, schedules, workflow,
equipment, inventory, reporting and AI agents, while delegating DICOM storage to Orthanc,
image display to OHIF/Weasis, identity to Keycloak, automation to n8n and agent reasoning
to LangGraph.

## Architecture

```
┌──────────────────────────────────────────── GeraldOS (Next.js) ─┐
│ Dashboard · Reception · Scheduling · Workflow · Imaging          │
│ Equipment · Inventory · Reporting · AI Agents · Settings          │
├───────────────┬────────────────┬─────────────────┬───────────────┤
│ Keycloak      │ Orthanc        │ HAPI FHIR       │ n8n           │
│ OIDC + JWT    │ DICOM/DICOMweb │ Patient/Imaging │ automation    │
│ HMAC session  │ REST proxy     │ proxy API       │ webhooks      │
├───────────────┼────────────────┼─────────────────┼───────────────┤
│ LangGraph     │ OHIF / Weasis  │ Dicoogle        │ MinIO · Redis │
│ agent runtime │ viewers        │ search proxy    │ storage/queue │
└───────────────┴────────────────┴─────────────────┴───────────────┘
```

## Module map

| Module | Route | API |
|---|---|---|
| Operations Command Centre | `/` | `/api/command-centre`, `/api/events`, `/api/analytics` |
| Reception | `/reception` | `/api/patients`, `/api/appointments` |
| Scheduling | `/scheduling` | `/api/appointments`, `/api/equipment`, `/api/staff` |
| Clinical Workflow | `/workflow` | `/api/workflow`, `/api/workflow/:id` |
| Imaging Workspace | `/imaging` | `/api/orthanc/*`, `/api/annotations`, `/api/bookmarks`, `/api/ai-review` |
| AI Review | `/review` | `/api/ai-review`, `/api/ai-review/:id` |
| Reporting Assistant | `/reporting` | `/api/reports`, `/api/reports/:id`, `/api/reports/assist`, `/api/reports/:id/versions`, `/api/reports/templates` |
| Knowledge Platform | `/knowledge` | `/api/knowledge`, `/api/knowledge/:id` |
| Equipment | `/equipment` | `/api/equipment` |
| Inventory | `/inventory` | `/api/inventory` |
| Finance | `/finance` | `/api/finance/*` |
| AI Agents | `/agents` | `/api/agents/chat` |
| Auth | `/login` | `/api/auth/login|callback|me|logout|dev` |
| Integrations | `/settings` | `/api/n8n/trigger`, `/api/webhooks/n8n`, `/api/minio/*`, `/api/fhir` |
| Decision Engine | — | `/api/decisions`, `/api/decisions/:id` |
| Event Bus | — | `/api/events` |
| Notifications | — | `/api/notifications` |

## Running

```bash
# 1. Start the approved stack
docker compose up -d

# 2. Configure the app
cp .env.example .env          # edit endpoints/secrets

# 3. Push the schema + seed demo data
npm run db:push
curl -X POST http://localhost:3000/api/seed

# 4. Run the platform
npm install && npm run build && npm start
```

Engineering commands (the same pipeline CI runs):

```bash
npm run typecheck      # tsc --noEmit
npm run lint           # eslint . (0 errors, 0 warnings)
npm run test:coverage  # vitest run --coverage (thresholds enforced)
npm run build          # next build (standalone output for the Docker image)
```

Container probes: `GET /api/health` (DB probe with latency, uptime, RSS) and
`GET /api/metrics` (request counts, status classes, latency buckets) — both
public. Integration health: `GET /api/integrations/status`. Log verbosity is
controlled by `LOG_LEVEL` (`debug | info | warn | error`).

## API contract

- **List endpoints** accept `?page`, `?pageSize` (max 200), optional
  whitelisted `?sort`/`?dir`, and domain filters, and always respond
  `{ data, meta: { page, pageSize, total } }`.
- **Errors** share one envelope from `src/lib/api-error.ts`:
  `{ error: { code, message } }` (e.g. `VALIDATION_ERROR`, `NOT_FOUND`,
  `FORBIDDEN`, `RATE_LIMITED`, `INTERNAL_ERROR` — 5xx details never leak).
- Mutating routes are validated with Zod schemas (`src/lib/validation.ts`) and
  protected by `withAuth` + role-based permissions (`src/lib/rbac.ts`).

## Integration contracts

- **Keycloak** — OIDC Authorization Code flow. `/api/auth/login` discovers the realm's
  `.well-known/openid-configuration`, `/api/auth/callback` verifies `id_token` against the
  realm JWKS and issues an HS256 session cookie with `realm_access` roles. When
  `KEYCLOAK_URL` is unset the middleware runs in degraded mode and `/api/auth/dev`
  issues a local admin session.
- **Orthanc** — Server-side REST proxy (`/api/orthanc/proxy?p=studies/<id>…`) keeps
  PACS credentials off the browser; `/api/orthanc/studies` returns the expanded study list.
- **OHIF / Weasis** — Study rows deep-link to
  `${OHIF_URL}/viewer?StudyInstanceUIDs=<uid>`.
- **HAPI FHIR** — `/api/fhir?resource=Patient&_count=20` proxies FHIR R4 read/search.
- **Dicoogle** — `/api/dicoogle/search?q=PatientID:*` proxies free-text index queries.
- **n8n** — Outbound: `POST /api/n8n/trigger { workflow, data }` fires a configured
  webhook. Inbound: n8n flows POST platform events to `/api/webhooks/n8n` (audit-logged).
- **LangGraph** — `POST /api/agents/chat` creates a thread and runs
  `POST /threads/:id/runs/wait` with the agent's `assistant_id`; unreachable runtime
  automatically falls back to a live-data simulation that reads the PostgreSQL operational state.
- **MinIO** — `/api/minio/status` lists buckets (SigV4 via aws4fetch) and auto-creates the
  default bucket; `/api/minio/presign` returns browser-safe presigned PUT URLs.
- **Redis** — Health-checked over TCP (PING) in `/api/integrations/status`.

Every service reports **connected / unreachable / not_configured** with real latency on the
Dashboard and Settings pages, refreshed every 30 s.

## AI-native platform layer

- **Decision Engine** — every AI action flows *recommendation → business rules →
  validation → approval → execution → audit*. Rules forbid auto-finalising reports,
  autonomous diagnosis, and unauthorised STAT actions. See `src/lib/decision-engine.ts`.
- **Event Bus (Redis Streams)** — `publishEvent` XADDs to `geraldos:events` when Redis
  is configured and always persists to `event_log` for the activity feed. See `src/lib/events.ts`.
- **Specialised agents** — nine independent agents (reception, scheduling, workflow,
  reporting, equipment, inventory, quality, executive, knowledge) with mission, tools,
  memory and event subscriptions. See `src/lib/agents.ts`.
- **Reporting assistant** — template recommendation, draft structure, quality scoring,
  checklist reminders, critical-finding flags, terminology consistency, measurement
  extraction, prior-study comparison and version history. Never finalises reports.
- **Multi-modal AI review** — candidate observations with confidence, differentials and
  literature references across X-Ray, CT, MRI, US, Mammography, DEXA, Dental and Nuclear
  Medicine. Every accept/reject is audited. Never issues a diagnosis.
- **Knowledge platform** — approved SOPs, protocols, manuals, policies and standards;
  the Knowledge Agent answers exclusively from published documents.

## New tables (push schema before seeding)

`report_templates`, `report_versions`, `ai_observations`, `ai_recommendations`,
`knowledge_documents`, `study_bookmarks`, `study_annotations`, `event_log`, `notifications`.

## Security

- All service credentials stay server-side (API routes); the browser only receives the
  whitelisted non-secret config from `/api/integrations/client-config`.
- Sessions are `httpOnly, sameSite=lax` HS256 JWTs (`AUTH_SECRET`).
- `/api/webhooks/*` endpoints accept JSON only, validate event names, and write audit rows.
- Security headers (CSP tuned for the App Router, `X-Frame-Options DENY`,
  Referrer-Policy, Permissions-Policy) are enforced by `next.config.ts` `headers()`.
- Fixed-window rate limiting (Redis-backed with an in-memory fallback) protects
  `/api/auth/*`, `/api/webhooks/n8n` and `/api/agents/chat`.
- Cookie-authenticated mutations pass a strict Origin/Referer CSRF check in
  addition to the SameSite=Lax session cookie.
- `src/lib/env.ts` fails fast in production on missing secrets and rejects the
  known development `AUTH_SECRET` default; `/api/seed` is blocked outside development.

## Observability

- One structured JSON log line per event (`ts, level, msg`, enriched with
  `requestId`, `method`, `path`, `userId` inside a request); threshold via `LOG_LEVEL`.
- Every `withAuth` route runs inside an AsyncLocalStorage request context:
  unique `x-request-id` response header, one access-log line with duration, and
  central 5xx capture that logs full context while returning the safe envelope.
- In-memory request metrics (totals, status classes, per-route counts, latency
  buckets) at `GET /api/metrics`; `GET /api/health` reports DB latency, uptime
  and RSS for container monitoring.

## CI/CD

- `.github/workflows/ci.yml` runs `typecheck → lint → test (coverage
  thresholds) → build` on every pull request, then builds the production
  Docker image on `main` and smoke-tests `/api/health` and `/api/metrics`
  against a live Postgres.
- Dependabot keeps npm and GitHub Actions dependencies current (weekly).

## Changelog

Transformation programme (Master Specification), one commit per phase:

| Phase | Scope | Commit |
|---|---|---|
| 1–3 | Safety & security foundation, architectural consolidation (service layer, Zod, RBAC, canonical routes), Docker-first deployment | `9eca27a` |
| 4 | Design system consolidation — 8 UI primitives, pixel-identical convergence of 13 content pages | `26a73aa` |
| 5 | API contract standardization — unified list envelope, pagination, sort whitelists | `364fa00` |
| 6 | Client data layer — React Query adoption, typed API client, polling + invalidation parity | `11aee9d` |
| 7 | Test coverage expansion — service, validation and route-handler tests with coverage gate | `92bf5fd` |
| 8 | Security hardening II — security headers/CSP, rate limiting, CSRF origin check, secrets audit | `f814e56` |
| 9 | Observability — structured JSON logging, request tracing, central 5xx capture, `/api/metrics` | `385109e` |
| 10 | Performance & bundle optimization — next/image, dependency cleanup, staleTime tuning, bundle analyzer | `e147344` |
| 11 | Accessibility & keyboard UX — WCAG 2.1 AA baseline, ARIA command palettes, visible focus states | `e800ca6` |
| 12 | CI/CD & delivery foundation — GitHub Actions pipeline, Docker smoke test, Dependabot | this release |
