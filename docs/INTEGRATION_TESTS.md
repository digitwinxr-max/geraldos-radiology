# Integration Test Suite — Live Infrastructure Gate

Unit tests mock everything. These tests prove GeraldOS against **real**
PostgreSQL and Orthanc PACS, driving the production server build through the
exact flows a browser uses (native staff login included). No mocks anywhere
in `__integration__/`.

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
| Orthanc   | 58042 | user `orthanc`                          |
| OHIF      | 53001 | proxied by the app at `/viewer`         |

Apply the schema:

```bash
DATABASE_URL=postgresql://geraldos_admin:it_secure_pass@127.0.0.1:55432/geraldos npm run db:push
```

## 2. Build & run the app against that stack

All values match `.env.integration` (loaded automatically by the vitest config;
the app itself needs them as process env):

```bash
set DATABASE_URL=postgresql://geraldos_admin:it_secure_pass@127.0.0.1:55432/geraldos
set AUTH_SECRET=it-integration-secret-not-for-production-use
set ORTHANC_URL=http://127.0.0.1:58042
set ORTHANC_USERNAME=orthanc
set ORTHANC_PASSWORD=it_orthanc_pass
set OHIF_URL=http://127.0.0.1:53001

npm run build && npm run start   # port 3000
```

## 3. Run the suite

```bash
npm run test:integration
```

Environment is loaded from `.env.integration` automatically (Node built-in
`process.loadEnvFile` — no dotenv dependency); override any value by exporting
the variable before running.

## What each suite proves

| Suite                | Proof |
| -------------------- | ----- |
| `auth.test.ts`       | Anonymous 401s, login redirect, **native staff login** (`POST /api/auth/login` → scrypt verify → HS256 session) with roles bound into the session, wrong-password rejection, forged-token rejection, RBAC allow/deny per role, AI-safety fail-closed report signing, CSRF rejection of cross-origin mutations. |
| `imaging.test.ts`    | Authenticated DICOM upload into real Orthanc via the app proxy, DICOMweb session gating (no CORS wildcard), study aggregation reconciliation, and the workflow state machine walk referral → sent_to_orthanc guarded by a REAL Orthanc StudyInstanceUID. Also proves the **same-origin viewer mount** against the real `ohif/app` image: anonymous visitors are refused, `/viewer` serves the shell with `frame-ancestors 'self'`, and every root-level asset the shell references is fetched twice — through the app and straight from the container — and must agree, so a missing rewrite shows up immediately. |
| `events.test.ts`     | PostgreSQL-native bus end-to-end: durable `event_log` row with correlation id → ordered reads via the API; no secondary fan-out store exists. |
| `concurrency.test.ts`| N simultaneous same-stage workflow transitions produce exactly ONE application, no double audit rows, and a consistent final stage (optimistic-concurrency guard). |
| `resilience.test.ts` | Chaos contract: PostgreSQL down → fail-safe structured errors + health truth + full recovery; new logins fail closed while the DB is down while existing HS256 sessions stay valid; Orthanc down → no silent imaging success; forced outbox replay never duplicates durable effects. |

## Operational notes / known sharp edges

- **Staff are provisioned by the suite.** `provisionStaff()` inserts the four
  integration identities (`it-admin@gerald.test`, `it-radiologist@gerald.test`,
  `it-receptionist@gerald.test`, `it-noroles@gerald.test`, password
  `it-password`, scrypt-hashed) directly into PostgreSQL before login. Do not
  rely on the demo seed for the integration suite.
- **Login rate limiting is deliberate.** `/api/auth/login` is limited to 10/min
  per IP. The suite performs ~10 logins per run; rapid reruns will hit 429s.
  The `nativeLogin` helper retries with backoff honouring `Retry-After` — wait
  a minute between consecutive full-suite runs or expect longer hook times.
- **MRN is unique.** Tests generate dynamic MRNs (`MRN${Date.now()}`) — do not
  revert to fixed values or repeat runs will collide.
- **Orthanc places `StudyInstanceUID` on the STUDY resource**, not in an
  instance's `MainDicomTags` (which carry only SOPInstanceUID). Use
  `GET /instances/{id}/study`.
- **Radiologists cannot register patients** (`patients.read` only). Patient
  fixtures must be created by receptionist/admin jars.
