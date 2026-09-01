# GeraldOS — Lean Production Architecture Walkthrough

Authoritative record of the production-leaning + cleanup transformation. This
document is the single source of truth for *what changed, why, and what still
needs attention*. Repo facts and validation results are as-executed on the
session branch.

---

## BASELINE

- Starting commit: `45208caca104e361f160bb7e9e5c18cd8ddc8686` (`main`, clean tree).
- Recovery tag: `pre-production-leaning-45208ca` (created locally before any
  modification; not pushed).
- History: full 27-commit linear history was unshallowed; `8bed112…` was
  forensically confirmed unrecoverable (absent from GitHub, all remotes, local
  objects, reflog, worktrees and fsck-unreachable) and was **not** recreated.
- All work was performed on session branch
  `arena/01a05bf6-geraldos-radiology` (environment forbids pushing to `main`
  directly; delivery is a PR from the session branch to `main`).

## ARCHITECTURE DECISIONS

Target topology: **app (Next.js) + PostgreSQL + Orthanc + OHIF only.**

Every removal was gated by a dependency trace (active code refs / runtime /
prod / test deps / replacement required). Summary of the gate:

| Component | Classification | Evidence | Replacement |
|---|---|---|---|
| PostgreSQL 16 | KEEP | staff, patients, referrals, scheduling, workflow, reports, billing, event_log, audit — everything | — (authoritative) |
| Orthanc + DICOMweb | KEEP | PACS storage, `/api/orthanc/*`, study reconciliation | — (authoritative DICOM) |
| OHIF | KEEP | study viewer deep links | — |
| AI Review / Decision Engine / agents | KEEP | core clinical capability | — (in-app, assistive) |
| Keycloak / OIDC | REMOVE WITH CODE CHANGE | realm had no production users; staff + roles already in PG; OIDC stack (discovery, JWKS, callback) served no platform capability | native auth (ADR-012) |
| Redis | REMOVE WITH CODE CHANGE | events already durable in `event_log` (SSE reads the table); relay + XADD added a second store | PostgreSQL-only event bus (ADR-013) |
| MinIO | REMOVE WITH CODE CHANGE | no UI consumer of presign; Orthanc is the object store | Orthanc |
| Dicoogle | REMOVE WITH CODE CHANGE | no implemented consumer; Orthanc search suffices | Orthanc |
| n8n | REMOVE WITH CODE CHANGE | probe/text references only; no production-critical workflow | removed webhook routes |
| HAPI FHIR | REMOVE WITH CODE CHANGE | workstation lab summary was a best-effort fetch; agents text only | removed |
| LangGraph | REMOVE WITH CODE CHANGE | agents have an in-app PostgreSQL brain; chat route already fell back | in-app agents |
| MONAI / ONNX | NOT PRESENT | zero code references | — |

New ADRs appended to `docs/DECISIONS.md`: **ADR-012** native authentication,
**ADR-013** PostgreSQL-only event bus, **ADR-014** lean infrastructure
topology. Migration `drizzle/0002_native_auth` (new migration, history never
rewritten) adds `staff.password_hash`, drops the obsolete
`event_log_pending_idx`, and relaxes `publish_attempts` /
`last_publish_error` (legacy audit columns retained).

## AUTHENTICATION

Native, self-contained, fail-closed:

- **Storage**: `staff.password_hash` = `scrypt$N$r$p$<salt hex>$<key hex>`
  (N=16384, r=8, p=1, 64-byte derived key, random 16-byte salt). Verified with
  `crypto.timingSafeEqual`. No plaintext ever stored or logged.
- **Flow**: `POST /api/auth/login { email, password }` →
  `authenticateStaff` (case-insensitive email lookup on `staff`) →
  HS256 session JWT (`AUTH_SECRET`) with `{ sub, name, email, roles:
  [staff.role], iss: "geraldos-native" }` → HttpOnly/SameSite=Lax (Secure in
  production) cookie. RBAC unchanged (`src/lib/rbac.ts`).
- **Session endpoints**: `/api/auth/login` (10/60s/IP), `/api/auth/logout`
  (30/60s/IP, clears cookie), `/api/auth/me` (session read), `/api/auth/dev`
  (5/60s/IP, hard 403 unless `DEV_AUTH=true` and not production).
- **Edge gate** (`src/proxy.ts`): valid session → pass; dev + `DEV_AUTH=true`
  → pass with warning (dev only); dev without opt-in → 503
  `IDENTITY_NOT_CONFIGURED` (API) / `/login?error=identity_not_configured`
  (pages); production → 401 (API) / `/login` (pages), `DEV_AUTH` ignored.
- **Removed**: `src/lib/auth/oidc.ts`, `src/lib/auth/origin.ts`,
  `/api/auth/callback`, Keycloak realm import, `auth-origin.test.ts`.
- **Known gap (deferred)**: there is no staff password-provisioning UI/API —
  only the dev seed writes `password_hash`. Before a real deployment can log
  in, administrators must provision initial hashes (SQL update or an admin
  set-password flow — see REMAINING RISKS).

## REMOVED

Code, config and tests removed with their dependency trace:

- `src/app/api/auth/callback/route.ts`, `src/lib/auth/oidc.ts`,
  `src/lib/auth/origin.ts`.
- `src/lib/redis.ts`, Redis relay in `src/lib/events.ts`, Redis path in
  `src/lib/rate-limit.ts`, `ioredis` dependency.
- `src/app/api/minio/{presign,status}/route.ts`,
  `src/lib/integrations/minio.ts`, `aws4fetch` dependency.
- `src/app/api/dicoogle/search/route.ts`, `src/app/api/fhir/route.ts`,
  `src/app/api/n8n/trigger/route.ts`, `src/app/api/webhooks/n8n/route.ts`,
  `src/app/api/docs/route.ts`.
- `services/{keycloak,fhir,dicoogle,n8n,ohif,langgraph_agent,start-all}.mjs|py`,
  `docker/{keycloak,dicoogle,ohif}` (incl. `docker/ohif/nginx.conf`),
  `scripts/setup-render-env.sh`.
- Tests: `__tests__/routes/webhooks.test.ts`,
  `__tests__/routes/webhook-secret.test.ts`, `__tests__/lib/auth-origin.test.ts`.
- `dotenv` dependency (integration config now uses Node's
  `process.loadEnvFile`).
- OIDC/Keycloak/Redis mocks and helpers in `__tests__/` and
  `__integration__/` replaced by native-auth / PG-only equivalents.

## RETAINED

Everything clinically critical is untouched and still covered by tests:
patients, referrals (table + new intake API), appointments/scheduling, the
workflow state machine (optimistic concurrency), Orthanc proxy/upload/
DICOMweb, OHIF deep links, workstation context, AI Review (candidate
observations, accept/reject audit, assistive-only), Decision Engine (safety
gates; AI never signs), reporting + versioning + signing, invoices (Botswana
14% VAT) + payments + medical-aid claims (BOMAID/BPOMAS/Pula), staff/RBAC,
branches, modalities, audit_log, event_log (transactional outbox), SSE stream,
in-memory bounded rate limiting, health/metrics probes, security headers, CSRF
origin checks.

## MINIO

**Removed.** Evidence: the only consumers were `/api/minio/status` and
`/api/minio/presign` (SigV4 via aws4fetch) with no UI path exercising
browser-direct uploads; DICOM objects are stored authoritatively in Orthanc.
No replacement object storage was introduced. Removed
`src/lib/integrations/minio.ts`, both routes, `aws4fetch` from `package.json`
(lockfile regenerated; zero `aws4fetch` refs remain outside historical docs).

## REDIS

**Removed.** Evidence: `event_log` was already the durable record of truth —
SSE consumers polled the table, and the relay merely mirrored rows into a
Redis stream that no production consumer read. Removing Redis keeps durability
(PG outbox: `recordEventInTransaction` persists atomically with the domain
mutation), idempotency (SSE ordered cursor = exactly-once per client), and
auditability (every event has correlation_id). Rate limiting moved to a bounded
in-memory fixed-window map (10k key cap). Removed `src/lib/redis.ts`, the
relay, `REDIS_URL` from deploy files, and `ioredis`. Trade-off: rate-limit
windows are per-instance — multi-instance deployments must pin clients to an
instance or front with a proxy that shares state (see REMAINING RISKS).

## KEYCLOAK

**Removed.** Evidence: the realm import (`geraldos-realm.json`) contained no
production identities; staff and roles already lived in the GeraldOS `staff`
table; the OIDC code flow, JWKS verification and `KEYCLOAK_*` env plumbing
added a second identity system to operate with no platform benefit. Replaced by
native authentication (see AUTHENTICATION). Removed `src/lib/auth/oidc.ts`,
the callback route, the compose service, `docker/keycloak/`, `KEYCLOAK_*`
variables from `.env.example`, `render.yaml` and docs, and all OIDC mocks in
tests/integration helpers.

## CLINICAL CORE

Protected end-to-end (unchanged behaviour, still test-covered):

- Patients, referrals, appointments, scheduling, branches, modalities.
- Exam workflow: referral → check-in → protocol → scan → QA → review →
  report → billing, with optimistic-concurrency stage transitions (409 on
  conflict), TAT tracking, worklist + facets.
- Orthanc remains the authoritative DICOM store (REST proxy, uploads,
  DICOMweb with explicit session gate, no wildcard CORS).
- OHIF viewer integration (deep links; same-origin constraint documented).
- AI Review: candidate observations with confidence/differentials/references;
  accept/reject audited; never issues a diagnosis; radiologist signs.
- Reporting assistant + version history + sign workflow (radiologist-only,
  fail-closed on empty roles).
- Billing: invoices (VAT 14%), payments, medical-aid claims, tariffs.
- Staff/RBAC (wildcard permission matching), audit trail, event log
  (transactional outbox + SSE), notifications.

## REFERRALS

The `referrals` table, `referrals.*` RBAC permissions, the
`referral.received` event type and seed data already existed, but there was no
API to register or list referrals — the capability was genuinely missing at the
entry point of the clinical workflow. Implemented the **smallest viable
workflow**:

- `POST /api/referrals` — register a referral (patientId, referringPhysician,
  referringFacility, clinicalIndication, requestedProcedure, priority, notes);
  Zod-validated, `referrals.write`, audited (`referral.received`) and emitted
  as `referral.received`.
- `GET /api/referrals?patientId=…` — paginated list with patient context,
  `referrals.read`.
- `src/services/referrals-service.ts`, `createReferralSchema` in
  `src/lib/validation.ts`, and tests
  (`__tests__/services/referrals-service.test.ts`,
  `__tests__/routes/referrals.test.ts`).
- No new tables, no UI surface, no schema change — intake data can now be
  recorded; studies still begin at stage `referral` via `/api/workflow`.

## DEPLOYMENT

All deployment artifacts now match the tested architecture (app + PostgreSQL +
Orthanc + OHIF):

- `docker-compose.yml` — app, postgres, orthanc, ohif only.
- `docker-compose.integration.yml` — postgres + orthanc only (integration gate).
- `render.yaml` — Docker runtime, auto-generated `AUTH_SECRET`, DB link,
  health path `/api/health`; no setup script.
- `.env.example` — native-auth + Orthanc + OHIF variables only, with a
  security-posture comment block.
- `Dockerfile` — multi-stage: `npm ci --force` → standalone build → non-root
  `nextjs` runner, `CMD ["node","server.js"]`.
- `.github/workflows/ci.yml` — verify job (`npm ci --force`, typecheck, lint,
  coverage, build) + docker job on `main` using the GitHub-hosted Postgres
  service only.
- `scripts/db-seed.mjs` — `migrate | seed | all`; seed refuses
  `NODE_ENV=production`; `SEED_URL` overridable.
- `services/` — only `orthanc.json` remains; `docker/` — only `orthanc/`.
- `docker compose config` validation was **BLOCKED** in this environment (no
  Docker binary) — static inspection only; flagged under REMAINING RISKS.

## VALIDATION

Executed on the session branch (all results as-of this document):

| Step | Command | Result |
|---|---|---|
| Install | `npm ci --force` | PASS (7 pre-existing npm audit findings; `--force` required for optional esbuild platform pkg) |
| Types | `npm run typecheck` | PASS (0 errors) |
| Lint | `npm run lint` | PASS (0 errors, 4 pre-existing `<img>` warnings) |
| Unit tests | `npx vitest run` | PASS — 45 files / 353 tests |
| Build | `npm run build` | PASS (standalone, includes ƒ Proxy + all routes incl. `/api/referrals`) |
| Integration suite | `npx vitest run --config vitest.integration.config.mts` | Cannot run here — fails only at the intended live-gate preflight (`Missing ORTHANC_URL — start the integration stack first`); no live containers in this sandbox |
| Compose | `docker compose config` | BLOCKED — no Docker binary in environment |

`next-env.d.ts` is regenerated by `next build`; it was restored with
`git checkout -- next-env.d.ts` after the build (never committed).

## REMAINING RISKS

### Fixed (this refactor)

- Events were fan-out-before-durable (ADR-008 gap) → transactional PG outbox,
  SSE reads the table directly; no broker to lose.
- OIDC stack required a second identity system → native scrypt + HS256
  sessions; RBAC preserved.
- Stale deploy artifacts (setup script, dead nginx proxy target
  `host.docker.internal:61837`, unused compose services, dotenv) removed and
  deployment files aligned with the tested topology.
- Tests referencing removed infra (n8n webhooks, OIDC, ioredis mocks, Keycloak
  login helpers) removed/rewritten; native login success path is now genuinely
  covered with a real `@/db` mock.

### Deferred (deliberate scope cut)

- **Staff password provisioning UX**: no admin set-password/reset flow yet;
  initial hashes come from the dev seed or direct SQL. Required before a
  production rollout can onboard staff.
- `docs/` history (ADRs, KNOWN_ISSUES) intentionally documents the removed
  stack for auditability; `.qoder/repowiki/` (156 tracked files) is a stale
  auto-generated workspace wiki describing the old architecture — regenerate or
  archive it; it was left untouched by design.

### Known

- In-memory rate limiting is per-instance (10k-key cap): multi-instance
  deployments need front-proxy stickiness or a shared limiter; a single
  instance (the compose/Render topology) is fully protected.
- OHIF embedded viewer requires same-origin topology (SameSite=Lax cookie);
  documented workaround (co-located reverse proxy) unchanged.
- `docker compose config` not executed (no Docker in this environment) — CI
  docker job is the verification path.
- 7 npm audit findings (4 moderate, 3 high) pre-existing; not addressed by this
  refactor.

### Needs verification

- `scripts/db-seed.mjs` commands in README assume the compose app container;
  the bare-metal path (`node scripts/db-seed.mjs migrate|seed|all`) should be
  exercised against a live Postgres once Docker is available.
- `vitest.integration.config.mts` uses `process.loadEnvFile` (Node ≥20.12);
  verify on the CI Node version.
- The legacy `publish_attempts` / `last_publish_error` columns and the
  `/api/webhooks` public prefix in `src/proxy.ts` remain as harmless leftovers —
  confirm they should stay (audit history) or be cleaned in a follow-up.

## GIT

- Branch: `arena/01a05bf6-geraldos-radiology` (all work; `main` untouched).
- Baseline tag: `pre-production-leaning-45208ca`.
- Expected final commit (single, squashed): `refactor: lean production
  architecture and native auth`.
- Delivery: push session branch, open PR to `main` (direct push to `main`
  forbidden). No force-push, no history rewrite, no migration deletion.
