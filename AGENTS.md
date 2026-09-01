# GeraldOS — Agent Operating Guidelines

This document provides concise, durable rules and boundaries for AI coding agents operating on the GeraldOS repository.

---

## 1. Project Purpose & Topology

GeraldOS is an AI-native operations orchestration platform for Gerald Holdings Medical Diagnostic Imaging (Botswana). It sits above the clinical imaging stack, orchestrating workflows, scheduling, equipment, inventory, billing, structured reporting, and AI agents, while integrating externally with Orthanc (PACS, authoritative DICOM storage) and OHIF (Viewer). Authentication is native (PostgreSQL staff records + scrypt + HS256 sessions); the event bus is the PostgreSQL `event_log` outbox. Keycloak, Redis, MinIO, HAPI FHIR, Dicoogle, n8n and LangGraph were removed in the lean-production refactor — do not reintroduce them.

---

## 2. Architectural Boundaries & Authoritative Modules

Future agents MUST adhere to these architectural layer separations:

1. **Database Layer (`src/db/schema.ts`)**:
   - Single source of truth for all PostgreSQL tables and relations managed via Drizzle ORM.
   - All mutations must be typed through Drizzle schema models.
2. **Service Layer (`src/services/*`)**:
   - Authoritative location for all database queries, domain calculations, and business rules.
   - Route handlers MUST NOT execute direct Drizzle queries; they must call domain services.
3. **API Controllers (`src/app/api/*`)**:
   - Thin HTTP controllers wrapped in `withAuth` (`src/lib/middleware-helpers.ts`).
   - Use `src/lib/list-query.ts` for list pagination and sorting (`pageSize` max 200).
   - Use `src/lib/validation.ts` (Zod) for request payload validation.
   - Always return standard envelopes: `{ data, meta }` for lists, `{ error: { code, message } }` for errors (`src/lib/api-error.ts`).
4. **Client Data Layer (`src/hooks/*`, `src/lib/api-client.ts`, `src/lib/query-keys.ts`)**:
   - All client data fetching must use TanStack React Query hooks with centralized query key factories.
5. **UI Primitives (`src/components/ui/*`)**:
   - All pages and panels must use the 16 standard UI primitives for consistent styling, states, and accessibility.

---

## 3. Strict Invariants & Prohibitions

1. **DO NOT Rebuild or Re-architect**:
   - The Next.js 16 App Router + Service Layer + Drizzle + React Query architecture is authoritative and final.
   - Do NOT replace Drizzle ORM with Prisma or raw pg queries.
   - Do NOT introduce alternative state managers (e.g. Redux, Zustand).
2. **DO NOT Violate AI Safety Guardrails**:
   - AI agents and assistants MUST NOT autonomously sign/finalise radiology reports (`reports.status = 'final'`). Report signing is restricted strictly to authenticated human radiologists.
   - AI observations (`ai_observations`) are candidates requiring human review (accept/reject), never definitive diagnoses.
   - All AI-triggered actions must pass through the Decision Engine (`src/lib/decision-engine.ts`).
3. **DO NOT Leak Server Secrets**:
   - PACS credentials (`ORTHANC_PASSWORD`), `AUTH_SECRET`, and database strings must remain strictly on the server. Never pass raw credentials to the browser or expose them via `NEXT_PUBLIC_` prefixes.

---

## 4. Commands for Validation

Run these commands to validate changes (pipeline CI parity):

```bash
npm run typecheck      # tsc --noEmit (Must pass with 0 errors)
npm run lint           # eslint . (Must pass with 0 errors, 0 warnings)
npm run test:coverage  # vitest run --coverage (All test suites must pass)
npm run build          # next build (Compiles standalone production bundle)
```

---

## 5. Development Priorities & Technical Debt

1. **Fix `src/lib/env.ts` Empty String Fallback**: Ensure `process.env[name]` falls back properly to development default when set to `""`.
2. **Keep the Platform Self-Contained**: There are no external fallback runtimes — PostgreSQL, Orthanc and OHIF are the entire integration surface. AI agents operate on live PostgreSQL data; the Decision Engine gates execution; the radiologist remains the final decision-maker.
3. **Documentation Integrity**: Detailed architecture documentation lives in `docs/`. Update `docs/*.md` when introducing new routes, services, or database models.
