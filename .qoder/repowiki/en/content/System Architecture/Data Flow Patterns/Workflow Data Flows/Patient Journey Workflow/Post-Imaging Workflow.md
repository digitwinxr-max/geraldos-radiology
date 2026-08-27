# Post-Imaging Workflow

<cite>
**Referenced Files in This Document**
- [reporting.ts](file://src/lib/reporting.ts)
- [ai-review.ts](file://src/lib/ai-review.ts)
- [workflow.ts](file://src/lib/workflow.ts)
- [events.ts](file://src/lib/events.ts)
- [audit.ts](file://src/lib/audit.ts)
- [schema.ts](file://src/db/schema.ts)
- [reports route](file://src/app/api/reports/route.ts)
- [report detail route](file://src/app/api/reports/[id]/route.ts)
- [report versions route](file://src/app/api/reports/[id]/versions/route.ts)
- [templates route](file://src/app/api/reports/templates/route.ts)
- [AI review route](file://src/app/api/ai-review/route.ts)
- [report editor component](file://src/components/workstation/report-editor.tsx)
- [storage commitment route](file://src/app/api/orthanc/storage-commitment/route.ts)
</cite>

## Table of Contents
1. Introduction
2. Project Structure
3. Core Components
4. Architecture Overview
5. Detailed Component Analysis
6. Dependency Analysis
7. Performance Considerations
8. Troubleshooting Guide
9. Conclusion
10. Appendices

## Introduction
This document describes the post-imaging workflow in GeraldOS from AI review completion through final archiving. It covers the complete reporting lifecycle: report drafting, quality review, signing, release, and archival. It explains the report template system, version control mechanisms, quality scoring algorithms, radiologist signing workflow (including digital signature controls and compliance considerations), report release and distribution, archival procedures, data retention policies, audit trail requirements, compliance and governance practices, error handling, and examples of different report types with their specific workflow requirements.

## Project Structure
The post-imaging workflow spans several modules:
- Reporting assistant and templates for structured reporting and quality scoring
- AI review assistant that generates candidate observations per modality
- Workflow state machine enforcing forward-only transitions and handoff rules
- API endpoints for reports, templates, AI review, and storage commitment
- Database schema defining entities for studies, reports, versions, templates, AI observations, audit logs, events, and notifications
- Frontend workstation editor enabling drafting, signing, releasing, version history, and audit views

```mermaid
graph TB
subgraph "Frontend"
RE["ReportEditor UI"]
end
subgraph "API Layer"
RGET["GET /api/reports"]
RPATCH["PATCH /api/reports/:id"]
RTPL["GET /api/reports/templates"]
AIGET["GET /api/ai-review"]
AIPST["POST /api/ai-review"]
SC["POST /api/orthanc/storage-commitment"]
end
subgraph "Domain Logic"
WF["Workflow State Machine"]
REP["Reporting Assistant"]
AIR["AI Review Assistant"]
EVT["Event Bus"]
AUD["Audit Logger"]
end
subgraph "Data"
DB["PostgreSQL Schema"]
PACS["Orthanc/PACS"]
end
RE --> RPATCH
RE --> RTPL
RE --> AIGET
RE --> AIPST
RPATCH --> REP
RPATCH --> WF
RPATCH --> EVT
RPATCH --> AUD
AIPST --> AIR
AIPST --> EVT
AIGET --> DB
RTPL --> DB
WF --> DB
WF --> EVT
WF --> AUD
SC --> PACS
REP --> DB
AIR --> DB
EVT --> DB
```

**Diagram sources**
- [reports route:6-45](file://src/app/api/reports/route.ts#L6-L45)
- [report detail route:10-124](file://src/app/api/reports/[id]/route.ts#L10-L124)
- [templates route:9-29](file://src/app/api/reports/templates/route.ts#L9-L29)
- [AI review route:11-108](file://src/app/api/ai-review/route.ts#L11-L108)
- [workflow.ts:37-233](file://src/lib/workflow.ts#L37-L233)
- [reporting.ts:233-325](file://src/lib/reporting.ts#L233-L325)
- [ai-review.ts:91-220](file://src/lib/ai-review.ts#L91-L220)
- [events.ts:101-131](file://src/lib/events.ts#L101-L131)
- [audit.ts:4-24](file://src/lib/audit.ts#L4-L24)
- [storage commitment route:13-39](file://src/app/api/orthanc/storage-commitment/route.ts#L13-L39)

**Section sources**
- [schema.ts:102-180](file://src/db/schema.ts#L102-L180)
- [schema.ts:330-468](file://src/db/schema.ts#L330-L468)

## Core Components
- Reporting assistant: Provides structured templates, draft assistance, terminology checks, critical finding detection, measurement extraction, and quality scoring.
- AI review assistant: Generates candidate observations per modality with confidence, suggested differentials, literature references, and technical quality checks.
- Workflow state machine: Enforces forward-only stage transitions, required guards (e.g., signed before released, released before archived), audit logging, event publishing, and notifications.
- Report APIs: CRUD for reports, versioned snapshots on updates, template listing merging built-in and custom templates, and AI observation retrieval/generation.
- Storage commitment: DICOM Storage Commitment integration to verify safe storage in PACS for compliance.
- Audit and events: Immutable audit log entries and durable event persistence to support traceability and activity feeds.

**Section sources**
- [reporting.ts:233-325](file://src/lib/reporting.ts#L233-L325)
- [ai-review.ts:91-220](file://src/lib/ai-review.ts#L91-L220)
- [workflow.ts:93-233](file://src/lib/workflow.ts#L93-L233)
- [reports route:6-45](file://src/app/api/reports/route.ts#L6-L45)
- [report detail route:10-124](file://src/app/api/reports/[id]/route.ts#L10-L124)
- [templates route:9-29](file://src/app/api/reports/templates/route.ts#L9-L29)
- [AI review route:11-108](file://src/app/api/ai-review/route.ts#L11-L108)
- [storage commitment route:13-39](file://src/app/api/orthanc/storage-commitment/route.ts#L13-L39)
- [events.ts:101-131](file://src/lib/events.ts#L101-L131)
- [audit.ts:4-24](file://src/lib/audit.ts#L4-L24)

## Architecture Overview
The post-imaging workflow is event-driven and state-gated:
- Radiologists draft reports using structured templates and AI assistance.
- Quality scoring and terminology checks guide completeness and consistency.
- Signing requires explicit radiologist confirmation; only radiologists can sign.
- Release requires a signed report; only released studies can be archived.
- Every transition and status change emits events and records audits.
- Storage commitment verifies PACS integrity for regulatory compliance.

```mermaid
sequenceDiagram
participant Rad as "Radiologist"
participant FE as "ReportEditor UI"
participant API as "Reports API"
participant WF as "Workflow Engine"
participant DB as "Database"
participant EVT as "Event Bus"
participant AUD as "Audit Log"
Rad->>FE : Edit findings/impression/recommendation
FE->>API : PATCH /api/reports/ : id {status,drafts}
API->>DB : Snapshot previous version (report_versions)
API->>WF : transitionStudy({to : "signed"})
WF->>DB : Update workflow_studies.stage
WF->>AUD : recordAudit(action="workflow.transition")
WF->>EVT : publishEvent("report.signed","worklist.updated")
API-->>FE : Updated report + status
FE-->>Rad : Signed confirmation
```

**Diagram sources**
- [report detail route:47-124](file://src/app/api/reports/[id]/route.ts#L47-L124)
- [workflow.ts:102-233](file://src/lib/workflow.ts#L102-L233)
- [events.ts:101-131](file://src/lib/events.ts#L101-L131)
- [audit.ts:4-24](file://src/lib/audit.ts#L4-L24)

## Detailed Component Analysis

### Report Template System
- Built-in templates cover common modalities (X-Ray, CT, MRI, Ultrasound, Mammography).
- Custom templates are merged with built-ins via the templates endpoint.
- Templates define sections, checklists, and hints to guide structured reporting.
- The editor auto-selects a template based on modality and displays section tags.

```mermaid
flowchart TD
Start(["Template Selection"]) --> Modality{"Modality known?"}
Modality --> |Yes| Match["Match by modality or templateId"]
Modality --> |No| Default["Use default template"]
Match --> Merge["Merge built-in + active custom templates"]
Default --> Merge
Merge --> Render["Render sections and checklist in UI"]
```

**Diagram sources**
- [templates route:9-29](file://src/app/api/reports/templates/route.ts#L9-L29)
- [reporting.ts:24-175](file://src/lib/reporting.ts#L24-L175)
- [report editor component:112-122](file://src/components/workstation/report-editor.tsx#L112-L122)

**Section sources**
- [templates route:9-29](file://src/app/api/reports/templates/route.ts#L9-L29)
- [reporting.ts:24-175](file://src/lib/reporting.ts#L24-L175)
- [schema.ts:330-342](file://src/db/schema.ts#L330-L342)

### Version Control Mechanisms
- On any update to a report’s content fields, the previous version is snapshotted into report_versions with an incremented version number.
- Versions include findings, impression, recommendation, status, quality score, AI-assisted flag, and changedBy.
- The frontend provides version history view with restore and compare capabilities.

```mermaid
sequenceDiagram
participant FE as "ReportEditor UI"
participant API as "PATCH /api/reports/ : id"
participant DB as "report_versions"
participant EVT as "Event Bus"
FE->>API : Update findings/impression/recommendation
API->>DB : Insert snapshot (version++)
API->>EVT : publishEvent("report.versioned")
API-->>FE : Updated report
```

**Diagram sources**
- [report detail route:74-96](file://src/app/api/reports/[id]/route.ts#L74-L96)
- [report versions route:8-21](file://src/app/api/reports/[id]/versions/route.ts#L8-L21)
- [events.ts:101-131](file://src/lib/events.ts#L101-L131)

**Section sources**
- [report detail route:74-96](file://src/app/api/reports/[id]/route.ts#L74-L96)
- [report versions route:8-21](file://src/app/api/reports/[id]/versions/route.ts#L8-L21)
- [schema.ts:344-356](file://src/db/schema.ts#L344-L356)

### Quality Scoring Algorithms
- Quality scoring evaluates findings length, impression presence and non-generic nature, distinction from findings, recommendation when required, absence of placeholders, terminology consistency, and premature signing prevention.
- Incomplete report detection lists failed checks for user remediation.
- Terminology drift detection suggests canonical terms; critical finding detection highlights urgent terms.

```mermaid
flowchart TD
S(["ScoreInput"]) --> Checks["Run weighted checks"]
Checks --> Findings["Findings substantive?"]
Checks --> Impression["Impression present & non-generic?"]
Checks --> Distinct["Impression distinct from findings?"]
Checks --> Recommendation["Recommendation recorded if required?"]
Checks --> Placeholders["No placeholder text?"]
Checks --> Terminology["Terminology consistent?"]
Checks --> Premature["Not signed prematurely?"]
Findings --> Score["Compute weighted score"]
Impression --> Score
Distinct --> Score
Recommendation --> Score
Placeholders --> Score
Terminology --> Score
Premature --> Score
Score --> Output["QualityBreakdown + issues"]
```

**Diagram sources**
- [reporting.ts:273-325](file://src/lib/reporting.ts#L273-L325)

**Section sources**
- [reporting.ts:273-325](file://src/lib/reporting.ts#L273-L325)

### Radiologist Signing Workflow and Compliance
- Signing requires explicit radiologist confirmation (approvedBy) and role validation; automatic finalization is prohibited.
- Only users with the radiologist role can sign; session verification is enforced at the API layer.
- Signing timestamps are recorded; audit entries capture signed actions; events are published for downstream systems.

```mermaid
sequenceDiagram
participant Rad as "Radiologist"
participant FE as "ReportEditor UI"
participant API as "PATCH /api/reports/ : id"
participant AUTH as "Session Verification"
participant DB as "reports"
participant AUD as "Audit Log"
participant EVT as "Event Bus"
Rad->>FE : Click "Sign Report"
FE->>API : PATCH {status : "signed", approvedBy}
API->>AUTH : Verify radiologist role
AUTH-->>API : Role OK
API->>DB : Set status="signed", signedAt=now
API->>AUD : recordAudit("report.signed")
API->>EVT : publishEvent("report.signed")
API-->>FE : Signed confirmation
```

**Diagram sources**
- [report detail route:55-72](file://src/app/api/reports/[id]/route.ts#L55-L72)
- [report detail route:98-121](file://src/app/api/reports/[id]/route.ts#L98-L121)
- [events.ts:101-131](file://src/lib/events.ts#L101-L131)
- [audit.ts:4-24](file://src/lib/audit.ts#L4-L24)

**Section sources**
- [report detail route:55-72](file://src/app/api/reports/[id]/route.ts#L55-L72)
- [report detail route:98-121](file://src/app/api/reports/[id]/route.ts#L98-L121)

### Report Release Process and Distribution
- Release requires a signed report; the workflow engine enforces this guard.
- Releasing advances the study to “released” and triggers worklist updates and notifications.
- External distribution is not implemented in the provided code; however, events are emitted which can be consumed by downstream systems for distribution workflows.

```mermaid
sequenceDiagram
participant Rad as "Radiologist"
participant FE as "ReportEditor UI"
participant API as "PATCH /api/reports/ : id"
participant WF as "transitionStudy"
participant DB as "workflow_studies"
participant EVT as "Event Bus"
participant AUD as "Audit Log"
Rad->>FE : Click "Release"
FE->>API : PATCH {status : "released"}
API->>WF : transitionStudy({to : "released"})
WF->>DB : Update stage="released", completedAt
WF->>AUD : recordAudit("workflow.transition")
WF->>EVT : publishEvent("report.released","worklist.updated")
WF-->>API : Transition result
API-->>FE : Released confirmation
```

**Diagram sources**
- [workflow.ts:156-165](file://src/lib/workflow.ts#L156-L165)
- [workflow.ts:167-204](file://src/lib/workflow.ts#L167-L204)
- [events.ts:101-131](file://src/lib/events.ts#L101-L131)

**Section sources**
- [workflow.ts:156-204](file://src/lib/workflow.ts#L156-L204)

### Archival Procedures, Data Retention, and Long-Term Storage
- Archival is gated: only released studies can be archived; the workflow enforces forward-only transitions.
- Storage commitment integration verifies that instances are safely stored in Orthanc/PACS for compliance.
- Event persistence ensures durable records even if Redis is unavailable; audit logs provide immutable trails.

```mermaid
flowchart TD
A["Released Study"] --> B{"Archive allowed?"}
B --> |Yes| C["transitionStudy(to:'archived')"]
C --> D["Update workflow_studies.stage='archived'"]
D --> E["Publish 'study.archived' event"]
E --> F["Record audit entry"]
B --> |No| G["Block transition"]
```

**Diagram sources**
- [workflow.ts:163-165](file://src/lib/workflow.ts#L163-L165)
- [workflow.ts:167-204](file://src/lib/workflow.ts#L167-L204)
- [storage commitment route:13-39](file://src/app/api/orthanc/storage-commitment/route.ts#L13-L39)

**Section sources**
- [workflow.ts:163-204](file://src/lib/workflow.ts#L163-L204)
- [storage commitment route:13-39](file://src/app/api/orthanc/storage-commitment/route.ts#L13-L39)

### AI Review Completion and Integration with Reporting
- AI review generates candidate observations per modality with confidence scores, suggested differentials, literature references, and technical quality checks.
- Observations are persisted as pending until accepted or rejected by the radiologist.
- The editor integrates AI findings insertion and displays quality metrics and reminders.

```mermaid
sequenceDiagram
participant FE as "Workstation UI"
participant API as "POST /api/ai-review"
participant AIR as "generateCandidates"
participant DB as "ai_observations"
participant EVT as "Event Bus"
FE->>API : Request candidates (modality, bodyPart, procedure)
API->>AIR : generateCandidates()
AIR-->>API : Candidate list
API->>DB : Insert observations (status=pending)
API->>EVT : publishEvent("ai.observation_suggested")
API-->>FE : Observations returned
```

**Diagram sources**
- [AI review route:52-108](file://src/app/api/ai-review/route.ts#L52-L108)
- [ai-review.ts:168-220](file://src/lib/ai-review.ts#L168-L220)
- [events.ts:101-131](file://src/lib/events.ts#L101-L131)

**Section sources**
- [AI review route:52-108](file://src/app/api/ai-review/route.ts#L52-L108)
- [ai-review.ts:168-220](file://src/lib/ai-review.ts#L168-L220)
- [report editor component:175-186](file://src/components/workstation/report-editor.tsx#L175-L186)

### Examples of Report Types and Specific Workflow Requirements
- Chest X-Ray Standard: Structured sections include clinical history, comparison, technique, findings, impression; checklist emphasizes prior comparisons, lines/tubes, apices/costophrenic angles, acute vs chronic.
- CT Brain Standard: Sections include clinical history, comparison, technique, findings, impression, recommendation; checklist includes hemorrhage assessment, midline shift, ventricles, grey-white differentiation.
- CT Chest/Abdomen/Pelvis: Sections split by region; checklist includes lung nodules, lymph nodes, solid organs, bone lesions.
- MRI Brain Standard: Sections include sequences and findings; checklist includes DWI/ADC, demyelination, vessels, enhancement patterns.
- MRI Knee Standard: Sections include menisci, ligaments, cartilage, bone; checklist includes meniscus zones, ACL integrity, chondral grading, bone bruising.
- Ultrasound Abdomen: Sections include liver, gallbladder, kidneys, spleen, pancreas, aorta; checklist includes organ measurements, focal lesions, hydronephrosis, aortic diameter.
- Mammography Screening: Sections include breast composition, findings, BI-RADS, recommendation; checklist includes density categorization, mass description, BI-RADS category.

These templates drive structured drafting and checklist reminders in the editor, ensuring modality-specific completeness and consistency.

**Section sources**
- [reporting.ts:24-175](file://src/lib/reporting.ts#L24-L175)
- [report editor component:295-325](file://src/components/workstation/report-editor.tsx#L295-L325)

## Dependency Analysis
Key dependencies and relationships:
- Reports API depends on database schema for reports, patients, staff, and report versions.
- Workflow engine depends on database schema for workflow studies and reports, and uses audit and event modules.
- Reporting assistant provides templates and quality logic used by the editor and assist endpoint.
- AI review module supplies candidate generation and technical quality checks integrated via the AI review API.
- Storage commitment integrates with Orthanc/PACS for compliance verification.

```mermaid
graph LR
ReportsAPI["Reports API"] --> Schema["Schema (reports, patients, staff, versions)"]
Workflow["Workflow Engine"] --> Schema
Workflow --> Audit["Audit Logger"]
Workflow --> Events["Event Bus"]
Reporting["Reporting Assistant"] --> Schema
AIReview["AI Review API"] --> Schema
AIReview --> Events
Editor["ReportEditor UI"] --> ReportsAPI
Editor --> AIReview
StorageCommit["Storage Commitment"] --> Orthanc["Orthanc/PACS"]
```

**Diagram sources**
- [reports route:6-45](file://src/app/api/reports/route.ts#L6-L45)
- [report detail route:10-124](file://src/app/api/reports/[id]/route.ts#L10-L124)
- [workflow.ts:23-28](file://src/lib/workflow.ts#L23-L28)
- [ai-review route:1-108](file://src/app/api/ai-review/route.ts#L1-L108)
- [storage commitment route:1-39](file://src/app/api/orthanc/storage-commitment/route.ts#L1-L39)
- [schema.ts:166-180](file://src/db/schema.ts#L166-L180)
- [schema.ts:330-468](file://src/db/schema.ts#L330-L468)

**Section sources**
- [schema.ts:166-180](file://src/db/schema.ts#L166-L180)
- [schema.ts:330-468](file://src/db/schema.ts#L330-L468)

## Performance Considerations
- Event bus writes to Redis Streams are best-effort; durable persistence to event_log ensures availability without Redis.
- Version snapshots occur on each content update; consider batching or debouncing heavy operations if needed.
- Quality scoring runs client-side in the editor; server-side assists compute lightweight checks to avoid blocking.
- Workflow transitions perform minimal DB updates and emit events asynchronously where possible.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and handling:
- Invalid workflow stage or backward transitions: The workflow engine returns errors for unknown stages and rejects backward moves.
- Missing required context: Transitions like sent_to_orthanc require a studyInstanceUid; assigned/opened require a radiologistId.
- Signing restrictions: Auto-finalization is blocked; signing requires explicit approvedBy and radiologist role verification.
- Report creation/fetch failures: API endpoints return standardized error responses on exceptions.
- Storage commitment failures: Endpoint returns reasons such as not configured or study not found.

Recommended diagnostics:
- Check audit logs for action traces and details.
- Inspect event logs for published events and payloads.
- Validate database constraints and foreign keys for reports, versions, and workflow studies.
- Confirm session roles and cookies for signing operations.

**Section sources**
- [workflow.ts:111-165](file://src/lib/workflow.ts#L111-L165)
- [report detail route:55-72](file://src/app/api/reports/[id]/route.ts#L55-L72)
- [reports route:31-45](file://src/app/api/reports/route.ts#L31-L45)
- [storage commitment route:13-39](file://src/app/api/orthanc/storage-commitment/route.ts#L13-L39)
- [events.ts:101-131](file://src/lib/events.ts#L101-L131)
- [audit.ts:4-24](file://src/lib/audit.ts#L4-L24)

## Conclusion
GeraldOS implements a robust post-imaging workflow with strong safeguards: structured reporting via templates, AI-assisted drafting, rigorous quality scoring, explicit radiologist signing with role enforcement, controlled release and archival transitions, comprehensive audit trails, and durable event persistence. The system supports multiple modalities with tailored templates and checklists, integrates with PACS for storage commitment, and provides extensibility via events for downstream distribution and automation.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Data Models Relevant to Post-Imaging Workflow
```mermaid
erDiagram
WORKFLOW_STUDIES {
uuid id PK
uuid patient_id FK
varchar accession_number
varchar study_instance_uid
varchar modality
varchar procedure
varchar body_part
varchar stage
uuid radiologist_id FK
varchar priority
timestamp started_at
timestamp completed_at
timestamp created_at
timestamp updated_at
}
REPORTS {
uuid id PK
uuid study_id FK
uuid patient_id FK
uuid radiologist_id FK
varchar template_name
text findings
text impression
text recommendation
varchar status
timestamp signed_at
timestamp created_at
timestamp updated_at
}
REPORT_VERSIONS {
uuid id PK
uuid report_id FK
integer version
text findings
text impression
text recommendation
varchar status
integer quality_score
boolean ai_assisted
varchar changed_by
timestamp created_at
}
AI_OBSERVATIONS {
uuid id PK
uuid study_id FK
varchar orthanc_study_id
varchar modality
varchar region
varchar category
text description
numeric confidence
jsonb bounding_box
jsonb suggested_differential
jsonb literature_refs
jsonb similar_case_ids
varchar status
varchar reviewed_by
timestamp reviewed_at
varchar model_version
timestamp created_at
}
AUDIT_LOG {
serial id PK
varchar user_id
varchar action
varchar module
varchar entity_type
varchar entity_id
jsonb details
varchar ip_address
timestamp created_at
}
EVENT_LOG {
serial id PK
varchar event_type
varchar aggregate
varchar aggregate_id
jsonb payload
varchar source
timestamp occurred_at
}
WORKFLOW_STUDIES ||--o{ REPORTS : "has"
REPORTS ||--o{ REPORT_VERSIONS : "versions"
WORKFLOW_STUDIES ||--o{ AI_OBSERVATIONS : "generates"
```

**Diagram sources**
- [schema.ts:102-180](file://src/db/schema.ts#L102-L180)
- [schema.ts:330-468](file://src/db/schema.ts#L330-L468)