# GeraldOS Next Steps & Recovery Implementation Plan

This document outlines the prioritised action plan for engineering agents continuing development from the authoritative state left by Qoder.

---

## 1. Prioritised Implementation Plan

### P0 — Blocking Defects & CI Fixes — ✅ COMPLETE (Aug 2026)
1. ~~**Fix `src/lib/env.ts` Fallback Logic**~~ — DONE. `resolveEnv` treats blank
   values as unset; production fails fast, development falls back.
   (`__tests__/lib/env-secrets.test.ts`, 10/10 pass.)
2. ~~**Commit Staged Hardening & Untracked Test Suites**~~ — DONE (plus the
   Aug-2026 fail-closed hardening pass; 43 test files / 343 tests all green).

---

### P1 — Architectural & Integration Hardening
1. ~~**Keycloak OIDC Production Realm Sync**~~ — REMOVED by design. Identity is
   native (ADR-012): staff scrypt hashes in PostgreSQL + HS256 sessions. No
   external identity provider to sync. Staff password provisioning is the
   remaining product work (an admin "set password" flow over `staff.password_hash`).

2. **OHIF Same-Origin Topology** (see KNOWN_ISSUES O-1):
   - Ship a reference reverse-proxy config co-locating app + OHIF on one origin,
     or build OHIF with matching `PUBLIC_URL=/viewer/` and proxy it through
     Next.js rewrites. Until then the embedded iframe requires that topology;
     the imaging page's same-origin inspection works everywhere.

3. ~~**Transactional Outbox**~~ — DONE (ADR-013): `recordEventInTransaction`
   persists `event_log` atomically with domain mutations in `src/services/*`;
   SSE reads the durable table directly. No relay or broker remains.

---

### P2 — Feature Polish & Clinical Workflows
1. **Reporting Assistant Voice Dictation / Audio Integration**:
   - Wire Web Speech API / Whisper transcription into the Radiologist Report Editor (`src/components/workstation/report-editor.tsx`).

2. **OHIF Viewer Measurement Bi-directional Sync**:
   - Establish two-way event synchronization between OHIF measurement tools (via Cornerstone.js events) and `src/components/workstation/ai-review-overlay.tsx`.

3. **Botswana Medical Aid EDI / Electronic Claims Batch Export**:
   - Implement automated XML/JSON batch claim export for BOMAID and BPOMAS formats in `src/services/finance-service.ts`.

4. ~~**Live Keycloak Integration Suite**~~ — REMOVED with Keycloak. The
   integration gate now exercises the native login flow
   (`__integration__/auth.test.ts`) plus the PostgreSQL event bus
   (`__integration__/events.test.ts`) and chaos recovery
   (`__integration__/resilience.test.ts`) against live containers.

---

### P3 — Observability, Performance & Maintenance
1. ~~**Vite Config Extension Normalisation**~~ — DONE (`vitest.config.mts`,
   `import.meta.dirname`; warning gone).
2. **OpenTelemetry Exporter Integration**:
   - Add optional OTLP trace exporter to `src/lib/request-context.ts` for export to Grafana Tempo or Jaeger.
3. **Drizzle Migration Automation in CI**:
   - Add automated migration check (`drizzle-kit check`) in `.github/workflows/ci.yml`.
