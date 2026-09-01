# GeraldOS — AI-Native Diagnostic Imaging Operations Platform

Internal operations orchestration platform for Gerald Holdings Medical Diagnostic Imaging.
GeraldOS orchestrates patients, referrals, scheduling, clinical workflow, imaging,
reporting, billing, equipment, inventory and AI agents. DICOM storage and DICOMweb are
delegated to **Orthanc**, image display to **OHIF**, and all operational state — staff,
workflow, events, audit — lives in **PostgreSQL**. Authentication is **native** to GeraldOS
(scrypt password hashes on staff records + HS256 session cookies); no external identity
provider is required.

## Architecture

```
┌──────────────────────────── GeraldOS (Next.js) ─────────────────────────┐
│ Dashboard · Reception · Scheduling · Workflow · Imaging · Reporting     │
│ AI Review · Finance · Equipment · Inventory · Agents · Settings          │
├────────────────────────────┬────────────────────────────────────────────┤
│ PostgreSQL (authoritative) │ Orthanc (DICOM / DICOMweb / PACS)          │
│ staff · patients · events  │ REST proxy, uploads, study reconciliation  │
│ workflow · reports · audit │                                            │
├────────────────────────────┼────────────────────────────────────────────┤
│ OHIF viewer (browser)      │ AI Review (assistive, in-app)              │
│ deep links to studies      │ candidate observations, human final say    │
└────────────────────────────┴────────────────────────────────────────────┘
```

Everything else that once rode alongside (Keycloak, Redis, MinIO, HAPI FHIR, Dicoogle,
n8n, LangGraph) has been **removed** — see `walkthrough.md` → ARCHITECTURE DECISIONS for
the evidence behind each decision.

## Module map

| Module | Route | API |
|---|---|---|
| Operations Command Centre | `/` | `/api/command-centre`, `/api/events`, `/api/analytics` |
| Reception | `/reception` | `/api/patients`, `/api/appointments`, `/api/referrals` |
| Scheduling | `/scheduling` | `/api/appointments`, `/api/equipment`, `/api/staff` |
| Clinical Workflow | `/workflow` | `/api/workflow`, `/api/workflow/:id` |
| Imaging Workspace | `/imaging` | `/api/orthanc/*`, `/api/annotations`, `/api/bookmarks`, `/api/ai-review` |
| AI Review | `/review` | `/api/ai-review`, `/api/ai-review/:id` |
| Reporting Assistant | `/reporting` | `/api/reports`, `/api/reports/:id`, `/api/reports/assist`, `/api/reports/:id/versions`, `/api/reports/templates` |
| Knowledge Platform | `/knowledge` | `/api/knowledge`, `/api/knowledge/:id` |
| Equipment | `/equipment` | `/api/equipment` |
| Inventory | `/inventory` | `/api/inventory` |
| Finance | `/finance` | `/api/finance/*`, `/api/invoices`, `/api/claims` |
| AI Agents | `/agents` | `/api/agents/chat` |
| Auth | `/login` | `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/dev` |
| Integrations | `/settings` | `/api/integrations/status`, `/api/integrations/client-config` |
| Decision Engine | — | `/api/decisions`, `/api/decisions/:id` |
| Event Bus | — | `/api/events`, `/api/events/stream` |
| Notifications | — | `/api/notifications` |

## Running

```bash
# 1. Start the stack (PostgreSQL + Orthanc + OHIF + the app)
docker compose up -d --build

# 2. Configure the app
cp .env.example .env          # edit endpoints/secrets

# 3. Apply the schema (host-side; the app container runs NODE_ENV=production
#    and deliberately does not auto-migrate)
npm run db:migrate            # or npm run db:push (dev)

# 4. Seed demo data (development only — the seed refuses NODE_ENV=production)
npm run db:seed               # starts the app and POSTs /api/seed

# 5. Create the production administrator (one-time, explicit)
ADMIN_EMAIL=you@gerald.co.bw ADMIN_PASSWORD='<strong min-12-char password>' \
  npm run db:bootstrap-admin

# The app is served on http://localhost:3000. Demo login (after step 4):
# thato.ramotswe@gerald.co.bw / GeraldOS-Demo-2026!
```

Production (Render): the `render.yaml` Blueprint deploys GeraldOS + PostgreSQL
+ Orthanc + OHIF. Migrations run automatically via `preDeployCommand`; the
administrator bootstrap is a one-time explicit step. See `docs/DEPLOYMENT.md`.

Engineering commands (the same pipeline CI runs):

```bash
npm ci --force               # install (--force: optional esbuild platform pkg)
npm run typecheck            # tsc --noEmit
npm run lint                 # eslint . (0 errors)
npm run test:coverage        # vitest run --coverage (thresholds enforced)
npm run build                # next build (standalone output for the Docker image)
```

Container probes: `GET /api/health` (DB probe with latency, uptime, RSS) and
`GET /api/metrics` (request counts, status classes, latency buckets) — both
public. Integration health: `GET /api/integrations/status` (Orthanc + OHIF).
Log verbosity is controlled by `LOG_LEVEL` (`debug | info | warn | error`).

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

- **Native auth** — `POST /api/auth/login { email, password }` verifies the staff
  record in PostgreSQL (scrypt, timing-safe compare) and issues an HS256 session
  cookie (`AUTH_SECRET`). `/api/auth/me` reads the session, `/api/auth/logout`
  clears it. Development has an explicit opt-in `DEV_AUTH=true` admin bypass;
  production never exposes it.
- **Orthanc** — Server-side REST proxy (`/api/orthanc/proxy?p=studies/<id>…`) keeps
  PACS credentials off the browser; `/api/orthanc/studies` returns the expanded
  study list; `/api/orthanc/upload` accepts DICOM uploads; study reconciliation
  drives the worklist.
- **OHIF** — Study rows deep-link to `${OHIF_URL}/viewer?StudyInstanceUIDs=<uid>`.
- **PostgreSQL event bus** — `event_log` is the record of truth: critical domain
  flows insert their event in the same transaction as the mutation (transactional
  outbox), and the SSE stream (`/api/events/stream`) reads the durable table
  directly with an ordered cursor. No secondary fan-out store.

Every configured integration reports **connected / unreachable / not_configured**
with real latency on the Dashboard and Settings pages, refreshed every 30 s.

## AI-native platform layer

- **Decision Engine** — every AI action flows *recommendation → business rules →
  validation → approval → execution → audit*. Rules forbid auto-finalising reports,
  autonomous diagnosis, and unauthorised STAT actions. See `src/lib/decision-engine.ts`.
- **Event bus (PostgreSQL outbox)** — `recordEventInTransaction(tx, …)` persists
  atomically with the domain mutation; `publishEvent` is the best-effort path for
  non-critical flows. See `src/lib/events.ts`.
- **Specialised agents** — nine independent agents (reception, scheduling, workflow,
  reporting, equipment, inventory, quality, executive, knowledge) that operate on
  PostgreSQL operational data. AI output is assistive; the radiologist is the final
  decision-maker. See `src/lib/agents.ts`.
- **Reporting assistant** — template recommendation, draft structure, quality scoring,
  checklist reminders, critical-finding flags, terminology consistency, measurement
  extraction, prior-study comparison and version history. Never finalises reports.
- **Multi-modal AI review** — candidate observations with confidence, differentials and
  literature references across X-Ray, CT, MRI, US, Mammography, DEXA, Dental and Nuclear
  Medicine. Every accept/reject is audited. Never issues a diagnosis.
- **Knowledge platform** — approved SOPs, protocols, manuals, policies and standards;
  the Knowledge Agent answers exclusively from published documents.

## Schema migrations

Drizzle migrations live in `drizzle/` (`0000_*`, `0001_*`, `0002_native_auth`).
**Never rewrite history** — schema changes are always new numbered migrations.
Apply with `npm run db:push` (dev) or `node scripts/db-seed.mjs migrate` (SQL files).

## Security

- All service credentials stay server-side (API routes); the browser only receives the
  whitelisted non-secret config from `/api/integrations/client-config`.
- Passwords are stored as `scrypt$N$r$p$salt$key` (16-byte random salt, 64-byte derived
  key, `timingSafeEqual` verification). Sessions are `httpOnly, sameSite=lax`,
  Secure-in-production HS256 JWTs (`AUTH_SECRET`); logout clears the cookie.
- The edge proxy (`src/proxy.ts`) fails closed: protected traffic without a valid
  session gets 401 (API) or a login redirect (pages); production never runs in a
  degraded "no auth" mode.
- Security headers (CSP tuned for the App Router, `X-Frame-Options DENY`,
  Referrer-Policy, Permissions-Policy) are enforced by `next.config.ts` `headers()`.
- Fixed-window in-memory rate limiting (bounded, 10k keys) protects
  `/api/auth/*` and `/api/agents/chat`.
- Cookie-authenticated mutations pass a strict Origin/Referer CSRF check in
  addition to the SameSite=Lax session cookie.
- `src/lib/env.ts` fails fast in production on missing secrets and rejects the
  known development `AUTH_SECRET` default; `/api/seed` and `scripts/db-seed.mjs seed`
  are blocked outside development.

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
  against a live Postgres service.
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
| 12 | CI/CD & delivery foundation — GitHub Actions pipeline, Docker smoke test, Dependabot | `45208ca` |
| 13 | Lean production architecture — native auth, PostgreSQL event bus, infra removal, deploy alignment | this release |
