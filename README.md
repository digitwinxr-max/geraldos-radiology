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

Health check: `GET /api/health` · Integration health: `GET /api/integrations/status`

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
