---
kind: error_handling
name: Ad-hoc HTTP Exception Handling in FastAPI and Next.js API Routes
category: error_handling
scope:
    - '**'
source_files:
    - backend/app/main.py
    - backend/app/core/integrations.py
    - src/app/api/ai-review/route.ts
    - src/app/api/workflow/route.ts
    - src/app/api/auth/login/route.ts
    - src/app/api/agents/chat/route.ts
    - services/langgraph_agent.py
---

## What system/approach is used

There is no centralized error-handling framework, shared error-type hierarchy, or global middleware for errors. Errors are handled ad-hoc inside each route handler:

- **FastAPI backend** (`backend/app/main.py`): Uses `fastapi.HTTPException` raised directly from route functions to translate database/IO failures into HTTP responses. A generic `Exception` catch block wraps each write operation, rolls back the SQLAlchemy session, then raises `HTTPException(status_code=400, detail=str(e))`. External service calls (e.g. Orthanc via `httpx`) catch exceptions and raise `HTTPException(500, ...)` or forward upstream status codes.
- **Next.js App Router API routes** (`src/app/api/**/route.ts`): Each handler wraps its body in a `try/catch` and returns `NextResponse.json({ ok: true/false, ... }, { status })` on success and `{ error: "..." }` with an appropriate status code on failure. There is no shared error class, no Zod-style validation layer, and no global error boundary — every route re-implements its own catch block.
- **Integration helpers** (`backend/app/core/integrations.py`): Failures in async HTTP calls to Keycloak/FHIR/n8n/MinIO swallow exceptions by returning `False` (for fire-and-forget operations like `sync_pacs_to_fhir`, `trigger_n8n_notification`) or re-raising a plain `Exception("Token validation failed: ...")` from `verify_keycloak_token`. No typed exception classes exist.
- **LangGraph agent graph** (`services/langgraph_agent.py`): No error handling at all; nodes simply return state updates.

## Key files and packages

- `backend/app/main.py` — single-file FastAPI app where every endpoint performs inline `try/except` + `HTTPException` raising.
- `backend/app/core/integrations.py` — `StackIntegrationManager` swallowing network errors as booleans or re-raising bare `Exception`.
- `src/app/api/ai-review/route.ts` — example of per-route `try/catch` returning `{ ok, observations }` vs `{ ok: false, error, detail }`.
- `src/app/api/workflow/route.ts` — validates input manually (`if (!body) return 400`), catches DB errors and returns `{ error }` with 500.
- `src/app/api/auth/login/route.ts` — redirects to `/login?error=...` on OIDC discovery failure instead of returning JSON.
- `src/app/api/agents/chat/route.ts` — throws `new Error(...)` when downstream LangGraph HTTP calls fail (relying on Next.js default 500).

## Architecture and conventions

1. **Per-route try/catch**: Every mutating endpoint wraps its DB transaction in `try { db.execute(...); db.commit(); } except Exception as e: db.rollback(); raise HTTPException(...)`. Read endpoints also wrap queries in try/catch but without rollback.
2. **HTTPException as the only cross-boundary signal**: The FastAPI side never returns Python objects that represent domain errors — it always converts them to `HTTPException` with a numeric `status_code` and a human-readable `detail` string.
3. **No structured error envelope**: Responses are inconsistent. Some return `{ ok: true, data }`, others return `{ id, message }`, and errors are either `HTTPException.detail` strings or arbitrary `{ error: "..." }` JSON bodies. There is no unified shape enforced by middleware.
4. **Silent failures for side effects**: `sync_pacs_to_fhir` and `trigger_n8n_notification` return `False` on any exception, so callers must explicitly check the boolean return value; swallowed exceptions leave no trace.
5. **Auth errors redirect, not JSON**: The OIDC login flow catches OIDC discovery errors and issues a `NextResponse.redirect("/login?error=...")`, mixing response strategies between JSON APIs and HTML redirects.
6. **No global error middleware**: Neither FastAPI nor Next.js registers a custom exception handler or `catch` wrapper — error handling lives entirely inside individual route functions.

## Conventions and constraints

- **Database writes must be wrapped in try/except with explicit rollback**: Observed in every POST/PUT endpoint in `main.py`; a missing rollback would leak partial transactions.
- **External service calls must handle connection errors gracefully**: `integrations.py` demonstrates two patterns — return a boolean for non-critical side effects, or raise a descriptive `Exception` for critical auth flows.
- **Route handlers must validate inputs before touching the DB**: Manual checks like `if (!body?.modality) return 400` appear in multiple routes; there is no shared schema validator.
- **Errors are logged only via `console.error` in some routes** (e.g. `workflow create failed`); there is no structured logger configured, so production observability depends on platform logs rather than application-level audit trails.
- **No panics/recover equivalent**: Python uses `raise`/`except`; Node routes use `throw new Error` caught by local try/catch blocks. There is no process-wide recovery mechanism.