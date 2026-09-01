# GeraldOS API Reference Map

This document catalogues the API routes implemented in `src/app/api/`, specifying HTTP methods, required RBAC permissions, request schemas, and response contracts.

---

## 1. Global API Standards

- **List Endpoints**:
  - URL Query Parameters: `?page=1&pageSize=20&sort=createdAt&dir=desc&[filters]`
  - Maximum `pageSize`: `200` (enforced by `src/lib/list-query.ts`).
  - Response Envelope:
    ```json
    {
      "data": [ ... ],
      "meta": {
        "page": 1,
        "pageSize": 20,
        "total": 142
      }
    }
    ```
- **Error Responses**:
  - Response Envelope:
    ```json
    {
      "error": {
        "code": "VALIDATION_ERROR | NOT_FOUND | FORBIDDEN | UNAUTHORIZED | RATE_LIMITED | INTERNAL_ERROR",
        "message": "Human-readable description of error",
        "details": { ... }
      }
    }
    ```
- **Mutation & Security**:
  - Mutating methods (`POST`, `PUT`, `PATCH`, `DELETE`) require valid CSRF Origin headers.
  - Rate limiting applies to authentication, webhook, and AI agent endpoints.

---

## 2. API Endpoints by Domain

### 2.1 Operations & Command Centre
| Endpoint | Method | RBAC Permission | Description |
|---|---|---|---|
| `/api/command-centre` | `GET` | Authenticated | Aggregated real-time metrics, bottleneck alerts, modality utilization, and turnaround times. |
| `/api/analytics` | `GET` | Authenticated | Clinical volume analytics, stage breakdown, and physician referral distributions. |
| `/api/events` | `GET` | Authenticated | List paginated event bus logs. |
| `/api/events/stream` | `GET` | Authenticated | Real-time Server-Sent Events (SSE) stream for live updates. |

### 2.2 Reception & Scheduling
| Endpoint | Method | RBAC Permission | Description |
|---|---|---|---|
| `/api/patients` | `GET`, `POST` | `patients:read` / `patients:write` | Search/list patients with MRN, name, and DOB filters; register new patient. |
| `/api/referrals` | `GET`, `POST` | `referrals:read` / `referrals:write` | Referral intake: list referring-physician referrals (optionally by `patientId`); register a referral (audited, emits `referral.received`). |
| `/api/appointments` | `GET`, `POST` | `appointments:read` / `appointments:write` | List scheduled appointments by date/modality; create appointment booking. |
| `/api/equipment` | `GET`, `POST` | `equipment:read` / `equipment:write` | List operational imaging modalities; register new equipment. |
| `/api/staff` | `GET`, `POST` | `staff:read` / `staff:write` | List clinical and operational staff members; register new staff. |

### 2.3 Clinical Workflow & Workstation
| Endpoint | Method | RBAC Permission | Description |
|---|---|---|---|
| `/api/workflow` | `GET`, `POST` | `workflow:read` / `workflow:write` | List workflow studies by stage/modality; initiate new clinical study. |
| `/api/workflow/[id]` | `GET`, `PATCH` | `workflow:read` / `workflow:write` | Get study details; transition workflow stage with state machine validation. |
| `/api/worklist` | `GET` | `workflow:read` | Radiologist worklist query with urgent priority filtering. |
| `/api/worklist/facets` | `GET` | `workflow:read` | Aggregate counts grouped by modality, priority, and stage. |
| `/api/workstation/context` | `GET` | `workflow:read` | Complete multi-entity context for a study (patient, prior studies, annotations, reports). |
| `/api/annotations` | `GET`, `POST` | Authenticated | DICOM measurement annotations (length, angle, area, text). |
| `/api/annotations/[id]` | `GET`, `DELETE` | Authenticated | Get or delete measurement annotation. |
| `/api/bookmarks` | `GET`, `POST` | Authenticated | Radiologist study bookmarking and pin management. |
| `/api/bookmarks/[id]` | `DELETE` | Authenticated | Remove study bookmark. |

### 2.4 Reporting & AI Review
| Endpoint | Method | RBAC Permission | Description |
|---|---|---|---|
| `/api/reports` | `GET`, `POST` | `reports:read` / `reports:write` | List radiology reports; create draft report. |
| `/api/reports/[id]` | `GET`, `PATCH` | `reports:read` / `reports:write` | Get report; update findings, impression, or sign report (requires `radiologist` role). |
| `/api/reports/[id]/versions` | `GET` | `reports:read` | Retrieve full historical version trail for a report. |
| `/api/reports/assist` | `POST` | `reports:write` | AI reporting assistant: template recommendations, automated quality scoring, checklist checks. |
| `/api/reports/templates` | `GET`, `POST` | Authenticated | List and create structured report templates by modality. |
| `/api/ai-review` | `GET`, `POST` | Authenticated | List candidate AI observations by modality/study; submit new AI finding. |
| `/api/ai-review/[id]` | `GET`, `PATCH` | Authenticated | Radiologist observation review (accept, reject, or comment). |

### 2.5 Decision Engine & AI Agents
| Endpoint | Method | RBAC Permission | Description |
|---|---|---|---|
| `/api/decisions` | `GET`, `POST` | `decisions:read` / `decisions:write` | List AI recommendations and proposed actions; submit candidate recommendation. |
| `/api/decisions/[id]` | `GET`, `PATCH` | `decisions:read` / `decisions:write` | Inspect decision rule results; execute validated action or reject recommendation. |
| `/api/agents/chat` | `POST` | Authenticated | Interactive multi-agent conversational dispatch over live PostgreSQL operational data (in-app runtime). |

### 2.6 Knowledge & SOPs
| Endpoint | Method | RBAC Permission | Description |
|---|---|---|---|
| `/api/knowledge` | `GET`, `POST` | `knowledge:read` / `knowledge:write` | Query published clinical SOPs, protocols, and manuals; author new document. |
| `/api/knowledge/[id]` | `GET`, `PATCH` | `knowledge:read` / `knowledge:write` | Fetch knowledge document content; update or publish revision. |

### 2.7 Inventory & Equipment Maintenance
| Endpoint | Method | RBAC Permission | Description |
|---|---|---|---|
| `/api/inventory` | `GET`, `POST` | `inventory:read` / `inventory:write` | List inventory consumables and stock levels; record stock transaction. |
| `/api/notifications` | `GET`, `POST` | Authenticated | Fetch active user notifications; dispatch system alert. |
| `/api/notifications/[id]` | `PATCH` | Authenticated | Mark notification as read. |

### 2.8 Finance & Billing
| Endpoint | Method | RBAC Permission | Description |
|---|---|---|---|
| `/api/invoices` | `GET`, `POST` | `finance:read` / `finance:write` | List patient invoices; generate invoice with line items. |
| `/api/invoices/[id]` | `GET`, `PATCH` | `finance:read` / `finance:write` | Get invoice; update billing status. |
| `/api/payments` | `GET`, `POST` | `finance:read` / `finance:write` | Record payment receipt against invoice (Cash, Card, Medical Aid). |
| `/api/claims` | `GET`, `POST` | `finance:read` / `finance:write` | List insurance claims for Botswana schemes (BOMAID, BPOMAS, Pula); submit claim. |
| `/api/claims/[id]` | `GET`, `PATCH` | `finance:read` / `finance:write` | Update claim adjudication status. |
| `/api/tariffs` | `GET`, `POST` | `finance:read` | Search tariff master codes (cash price and medical aid rate). |
| `/api/expenses` | `GET`, `POST` | `finance:read` / `finance:write` | Track operating expenses. |
| `/api/finance/analytics` | `GET` | `finance:read` | Revenue, collection rate, outstanding debt, and medical aid claim performance. |

### 2.9 Administration & System
| Endpoint | Method | RBAC Permission | Description |
|---|---|---|---|
| `/api/branches` | `GET`, `POST` | `admin` | List and create physical imaging clinic branches. |
| `/api/employees` | `GET`, `POST` | `admin` | Manage employee HR records, compensation, and branch assignments. |
| `/api/roles` | `GET` | `admin` | List defined system RBAC roles and permissions. |
| `/api/settings/system` | `GET`, `POST` | `admin` | Retrieve and update system configuration key-value store. |

### 2.10 External Integrations & PACS Proxies
| Endpoint | Method | RBAC Permission | Description |
|---|---|---|---|
| `/api/orthanc/studies` | `GET` | Authenticated | Expanded list of DICOM studies from Orthanc. |
| `/api/orthanc/studies/[id]` | `GET`, `DELETE` | Authenticated | Detailed study metadata; delete study. |
| `/api/orthanc/proxy` | `GET` | Authenticated | Authenticated server-side proxy to Orthanc REST API. |
| `/api/orthanc/dicom-web/*` | `GET` | Authenticated | DICOMweb standard endpoints (WADO-RS, QIDO-RS, STOW-RS). |
| `/api/orthanc/upload` | `POST` | Authenticated | Direct multipart DICOM file upload to Orthanc. |

### 2.11 Platform Health & Telemetry
| Endpoint | Method | RBAC Permission | Description |
|---|---|---|---|
| `/api/health` | `GET` | Public | Readiness and liveness container probe with database ping and uptime. |
| `/api/metrics` | `GET` | Public | Prometheus-compatible in-memory request counts and latency histograms. |
| `/api/integrations/status` | `GET` | Authenticated | Real-time health check of the external services (Orthanc, OHIF). |
| `/api/integrations/client-config` | `GET` | Authenticated | Whitelisted non-secret configuration for frontend viewer setup. |
| `/api/seed` | `POST` | Dev Only | Database demo data seeding (strictly disabled in production). |
