---
kind: logging_system
name: Minimal Console-Based Logging with Structured Audit/Event Persistence
category: logging_system
scope:
    - '**'
source_files:
    - backend/app/main.py
    - backend/app/core/config.py
    - backend/requirements.txt
    - src/lib/audit.ts
    - src/lib/events.ts
    - src/app/api/workflow/route.ts
    - src/app/api/workflow/[id]/route.ts
    - src/app/api/seed/route.ts
    - src/lib/seed-new-modules.ts
---

## What system/approach is used

The GeraldOS codebase does **not** use a dedicated logging framework. There are no imports of `logging`, `structlog`, `loguru`, `pino`, `winston`, or any other structured logger in either the Python backend or the TypeScript frontend/API layer. Instead, the project relies on two complementary mechanisms:

1. **`console.error` / `console.warn`** — ad-hoc error reporting to stderr/stdout from Next.js API routes and utility modules.
2. **Structured persistence for audit and event streams** — domain-level "logs" (audit trail, activity feed) are written to PostgreSQL tables (`auditLog`, `eventLog`) via Drizzle ORM, with an optional Redis Streams fan-out for real-time distribution.

The FastAPI backend (`backend/app/main.py`) has no logging configuration at all: no request/response logging middleware, no log level setup, no file/console sink configuration. The only runtime output is what Uvicorn emits by default for HTTP requests.

## Key files and packages

- `backend/app/main.py` — FastAPI entry point; no logging setup, no middleware beyond CORS.
- `backend/app/core/config.py` — Pydantic settings for DB, Redis, MinIO, Keycloak, Orthanc, FHIR, Gemini; no log-level setting exists.
- `backend/requirements.txt` — no logging library dependency declared.
- `src/lib/audit.ts` — writes audit records to the `auditLog` table; failures fall through to `console.error("audit write failed", error)`.
- `src/lib/events.ts` — central event bus that publishes to Redis Streams (`geraldos:events`) and persists every event to the `eventLog` table; Redis failures are silently ignored while DB failures emit `console.error("event_log write failed", error)`.
- `src/app/api/workflow/route.ts`, `src/app/api/workflow/[id]/route.ts`, `src/app/api/seed/route.ts` — route handlers that log errors via `console.error`.
- `src/lib/seed-new-modules.ts` — uses `console.warn` for skipped seed entries.

## Architecture and conventions

- **No application-level log levels**: there is no concept of DEBUG/INFO/WARN/ERROR levels in the codebase. Errors are reported via `console.error`; warnings via `console.warn`. Informational operational events are not emitted as logs but as persisted domain records.
- **Audit trail as structured log**: `recordAudit()` in `src/lib/audit.ts` captures `userId`, `action`, `module`, `entityType`, `entityId`, and arbitrary `details` into the `auditLog` table. This is the closest thing to structured logging in the repo — it is a database-backed audit record, not a console/file sink.
- **Event stream as operational log**: `publishEvent()` in `src/lib/events.ts` defines a typed registry of ~40 domain events (`EVENT_TYPES`) such as `patient.registered`, `study.uploaded`, `report.signed`, etc. Each event carries `type`, `aggregate`, `aggregateId`, `payload`, `source`, and `occurredAt`. Events are first attempted on Redis Streams (capped at 10,000 entries) and always persisted to `eventLog` as the durable record. This makes the event log the canonical source of truth for platform activity.
- **Failures degrade gracefully**: both audit and event writers wrap their DB/Redis calls in try/catch blocks and never throw to callers. On failure they emit a `console.error` message and return silently, ensuring business logic continues even when logging sinks are down.
- **Backend has no custom logging**: the FastAPI service does not instrument its own endpoints with log statements; only HTTP request lines from Uvicorn appear in process stdout.

## Conventions and constraints

- **Observed convention**: operational state changes are recorded as persistent domain records (audit/event tables) rather than console logs. This is enforced by the design of `audit.ts` and `events.ts`, which swallow exceptions instead of propagating them.
- **Observed convention**: error paths in API routes use `console.error` with a short human-readable message plus the thrown `error` object.
- **Constraint**: because no logging framework is configured, log output cannot be filtered by level, routed to separate sinks, or enriched with correlation IDs — this is entirely left to the container/runtime environment (e.g., Docker stdout/stderr collection).
- **Constraint**: audit and event persistence are best-effort; a downstream consumer must treat missing audit/event rows as possible (the code explicitly handles Redis unavailability and DB write failures without failing the caller).
- **Constraint**: the backend config (`backend/app/core/config.py`) has no `LOG_LEVEL`, `LOG_FILE`, or similar setting, so log verbosity cannot be tuned via environment variables within the application.