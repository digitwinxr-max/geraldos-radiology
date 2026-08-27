# Integration Test Suite — Live Infrastructure Gate

Unit tests mock everything. These tests prove GeraldOS against **real**
PostgreSQL, Redis, Orthanc PACS and Keycloak, driving the production server
build through the exact flows a browser uses (full OIDC authorization-code
dance included). No mocks anywhere in `__integration__/`.

## Prerequisites

- Docker (for the integration stack)
- Node 20+
- A production build of the app (`npm run build`)

## 1. Start the integration stack

```bash
docker compose -f docker-compose.integration.yml up -d
```

Fixed ports on localhost:

| Service   | Port  | Notes                                   |
| --------- | ----- | --------------------------------------- |
| PostgreSQL| 55432 | db `geraldos`, user `geraldos_admin`    |
| Redis     | 56379 |                                         |
| Orthanc   | 58042 | user `orthanc`                          |
| Keycloak  | 58080 | realm `geraldos`, client `geraldos-frontend` |

Push the schema and seed the realm users (done automatically by compose import;
verify with `npm run db:push` if the schema changed):

```bash
DATABASE_URL=postgresql://geraldos_admin:it_secure_pass@127.0.0.1:55432/geraldos npm run db:push
```

## 2. Build & run the app against that stack

All values match `.env.integration` (loaded automatically by the vitest config;
the app itself needs them as process env):

```bash
set DATABASE_URL=postgresql://geraldos_admin:it_secure_pass@127.0.0.1:55432/geraldos
set AUTH_SECRET=it-integration-secret-not-for-production-use
set REDIS_URL=redis://127.0.0.1:56379
set ORTHANC_URL=http://127.0.0.1:58042
set ORTHANC_USERNAME=orthanc
set ORTHANC_PASSWORD=it_orthanc_pass
set KEYCLOAK_URL=http://127.0.0.1:58080
set KEYCLOAK_PUBLIC_URL=http://localhost:58080
set KEYCLOAK_REALM=geraldos
set KEYCLOAK_CLIENT_ID=geraldos-frontend

npm run build && npm run start   # port 3000
```

## 3. Run the suite

```bash
npm run test:integration
```

Environment is loaded from `.env.integration` automatically; override any value
by exporting the variable before running.

## What each suite proves

| Suite                | Proof |
| -------------------- | ----- |
| `auth.test.ts`       | Anonymous 401s, login redirect, **full OIDC code flow against real Keycloak** with roles bound into the HS256 session cookie, forged-token rejection, RBAC allow/deny per role, AI-safety fail-closed report signing, CSRF rejection of cross-origin mutations. |
| `imaging.test.ts`    | Authenticated DICOM upload into real Orthanc via the app proxy, DICOMweb session gating (no CORS wildcard), study aggregation reconciliation, and the workflow state machine walk referral → sent_to_orthanc guarded by a REAL Orthanc StudyInstanceUID. |
| `events.test.ts`     | ADR-010 contract end-to-end: durable `event_log` row with correlation id → relay fan-out to Redis Stream → `published_at` stamp; plus recovery — Redis stopped mid-flight, backlog drains without an app restart when it returns. |
| `concurrency.test.ts`| N simultaneous same-stage workflow transitions produce exactly ONE application, no double audit rows, and a consistent final stage (optimistic-concurrency guard). |

## Operational notes / known sharp edges

- **Login rate limiting is deliberate.** `/api/auth/login` + `/api/auth/callback`
  are limited to ~20/min. The suite performs ~10 logins per run; rapid reruns
  will hit 429s. The `keycloakLogin` helper retries with backoff honouring
  `Retry-After` — wait a minute between consecutive full-suite runs or expect
  longer hook times.
- **MRN is unique.** Tests generate dynamic MRNs (`MRN${Date.now()}`) — do not
  revert to fixed values or repeat runs will collide.
- **Orthanc places `StudyInstanceUID` on the STUDY resource**, not in an
  instance's `MainDicomTags` (which carry only SOPInstanceUID). Use
  `GET /instances/{id}/study`.
- **Radiologists cannot register patients** (`patients.read` only). Patient
  fixtures must be created by receptionist/admin jars.
