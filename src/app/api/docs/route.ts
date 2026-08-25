import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/docs — Returns an OpenAPI 3.1 specification for the GeraldOS API.
 *
 * Every route handler is documented here with request/response schemas,
 * making the platform self-documenting for integration partners.
 */
export async function GET() {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "GeraldOS API",
      description:
        "AI-Native Diagnostic Imaging Operations Platform — API reference.\n\n" +
        "All endpoints return JSON. Authentication is managed via Keycloak OIDC (when configured) " +
        "or local dev sessions. AI actions flow through the Decision Engine and are never auto-executed.\n\n" +
        "## List contract\n\n" +
        "Every row-list endpoint accepts the standard list parameters (see components.parameters) and returns " +
        "`{ data: [...], meta: { page, pageSize, total, totalPages } }`. Unknown sort fields return 400 " +
        "VALIDATION_FAILED. Sort allowlists: /patients (createdAt, lastName), /appointments (scheduledDate, createdAt), " +
        "/workflow (createdAt, priority), /invoices (issueDate, totalAmount), /reports (createdAt). " +
        "Other list endpoints reject the sort parameter. Errors always follow " +
        "`{ error: { code, message, details? } }`.",
      version: "2.0.0",
      contact: { name: "Gerald Holdings", url: "https://gerald.co.za" },
    },
    servers: [{ url: "/api", description: "Relative base" }],
    paths: {
      "/health": {
        get: {
          summary: "Health check",
          description: "Returns { ok: true } if PostgreSQL is reachable.",
          tags: ["System"],
          responses: { 200: { description: "Healthy" }, 500: { description: "Database unreachable" } },
        },
      },
      "/integrations/status": {
        get: {
          summary: "Full integration health",
          description: "Reports connected/unreachable/not_configured status for every approved-stack service with real latency.",
          tags: ["System"],
          responses: { 200: { description: "Integration health snapshot" } },
        },
      },
      "/command-centre": {
        get: {
          summary: "Operations Command Centre",
          description: "Real-time operational snapshot: patient flow, queue, machine utilisation, equipment health, pending reports, radiologist workload, referral sources, revenue, delays, emergency cases, inventory alerts, maintenance alerts, AI recommendations, operational risks.",
          tags: ["Command Centre"],
          responses: { 200: { description: "Full command centre snapshot" } },
        },
      },
      "/events": {
        get: {
          summary: "List platform events",
          description: "Standard list envelope over the event log.",
          tags: ["Events"],
          parameters: [
            { $ref: "#/components/parameters/PageParam" },
            { $ref: "#/components/parameters/PageSizeParam" },
            { name: "type", in: "query", schema: { type: "string" }, description: "Filter by event type (e.g. study.uploaded)" },
          ],
          responses: { 200: { description: "Event list" } },
        },
        post: {
          summary: "Publish a manual event",
          tags: ["Events"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["type", "aggregate"],
                  properties: {
                    type: { type: "string", description: "Event type (known or custom.*)", example: "custom.alert" },
                    aggregate: { type: "string", example: "notification" },
                    aggregateId: { type: "string" },
                    payload: { type: "object" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Event published" }, 400: { description: "Invalid event type" } },
        },
      },
      "/knowledge": {
        get: {
          summary: "Search knowledge documents",
          tags: ["Knowledge"],
          parameters: [
            { name: "q", in: "query", schema: { type: "string" }, description: "Tokenized search query" },
            { name: "category", in: "query", schema: { type: "string" } },
            { name: "includeAll", in: "query", schema: { type: "string", enum: ["0", "1"] } },
          ],
          responses: { 200: { description: "Document list" } },
        },
        post: {
          summary: "Create a knowledge document",
          tags: ["Knowledge"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["title", "category", "content"],
                  properties: {
                    title: { type: "string" },
                    category: { type: "string", enum: ["sop", "protocol", "manual", "vendor", "quality", "accreditation", "radiation", "policy", "training", "template", "preparation"] },
                    docType: { type: "string" },
                    summary: { type: "string" },
                    content: { type: "string" },
                    tags: { type: "array", items: { type: "string" } },
                    version: { type: "string" },
                    author: { type: "string" },
                    status: { type: "string", enum: ["draft", "published", "archived"] },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Document created" } },
        },
      },
      "/reports/templates": {
        get: {
          summary: "List reporting templates",
          description: "Built-in templates merged with DB-defined custom templates.",
          tags: ["Reporting"],
          responses: { 200: { description: "Template list" } },
        },
      },
      "/reports/assist": {
        post: {
          summary: "AI report assistance",
          description: "Returns draft structure, quality score, checklist, critical findings, terminology checks, prior studies. Decision support only — never auto-signs.",
          tags: ["Reporting"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    reportId: { type: "string" },
                    studyId: { type: "string" },
                    patientId: { type: "string" },
                    templateId: { type: "string" },
                    findings: { type: "string" },
                    impression: { type: "string" },
                    recommendation: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "AI assistance payload" } },
        },
      },
      "/reports/{id}": {
        get: { summary: "Get report with patient/radiologist context", tags: ["Reporting"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Report detail" } } },
        patch: {
          summary: "Update report (version snapshot)",
          description: "Saves a version snapshot of the previous state before applying updates. Moving to 'signed' requires explicit approvedBy (radiologist confirmation).",
          tags: ["Reporting"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    findings: { type: "string" },
                    impression: { type: "string" },
                    recommendation: { type: "string" },
                    status: { type: "string", enum: ["draft", "pending_review", "signed"] },
                    approvedBy: { type: "string", description: "Required when status=signed" },
                    aiAssisted: { type: "boolean" },
                    qualityScore: { type: "integer" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Updated report" }, 400: { description: "Cannot sign without approvedBy" } },
        },
      },
      "/reports/{id}/versions": {
        get: { summary: "Report version history", tags: ["Reporting"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Version list" } } },
      },
      "/ai-review": {
        get: {
          summary: "List AI review observations",
          tags: ["AI Review"],
          parameters: [
            { name: "studyId", in: "query", schema: { type: "string" } },
            { name: "orthancStudyId", in: "query", schema: { type: "string" } },
            { name: "status", in: "query", schema: { type: "string", enum: ["pending", "accepted", "rejected"] } },
          ],
          responses: { 200: { description: "Observation list" } },
        },
        post: {
          summary: "Generate AI review candidates",
          description: "Creates candidate observations for a study. The AI does NOT diagnose — candidates require radiologist accept/reject.",
          tags: ["AI Review"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["modality"],
                  properties: {
                    studyId: { type: "string" },
                    orthancStudyId: { type: "string" },
                    modality: { type: "string" },
                    bodyPart: { type: "string" },
                    procedure: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Observations created" } },
        },
      },
      "/ai-review/{id}": {
        patch: {
          summary: "Accept or reject an AI observation",
          description: "The radiologist explicitly decides. All decisions are audit-logged.",
          tags: ["AI Review"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status", "reviewedBy"],
                  properties: {
                    status: { type: "string", enum: ["accepted", "rejected"] },
                    reviewedBy: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Updated observation" } },
        },
      },
      "/decisions": {
        get: { summary: "List decisions in the engine", tags: ["Decision Engine"], parameters: [{ name: "status", in: "query", schema: { type: "string", enum: ["proposed", "validated", "approved", "rejected", "executed", "failed"] } }], responses: { 200: { description: "Decision list" } } },
        post: {
          summary: "Propose a new decision",
          description: "Evaluates business rules and validates. Requires explicit approval before execution.",
          tags: ["Decision Engine"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["agent", "recommendation"],
                  properties: {
                    agent: { type: "string" },
                    recommendation: { type: "string" },
                    rationale: { type: "string" },
                    priority: { type: "string", enum: ["stat", "urgent", "routine"] },
                    targetModule: { type: "string" },
                    targetAction: { type: "string" },
                    targetPayload: { type: "object" },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Decision proposed" } },
        },
      },
      "/decisions/{id}": {
        post: {
          summary: "Approve, reject, or execute a decision",
          tags: ["Decision Engine"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["action"],
                  properties: {
                    action: { type: "string", enum: ["approve", "reject", "execute"] },
                    approvedBy: { type: "string", description: "Required for approve/reject" },
                    reason: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Decision action result" } },
        },
      },
      "/notifications": {
        get: {
          summary: "List notifications (unread first)",
          description: "Standard list envelope plus an extra top-level `unread` count.",
          tags: ["Notifications"],
          parameters: [
            { $ref: "#/components/parameters/PageParam" },
            { $ref: "#/components/parameters/PageSizeParam" },
          ],
          responses: { 200: { description: "Notification list with unread count" } },
        },
        post: { summary: "Create a notification", tags: ["Notifications"], responses: { 201: { description: "Notification created" } } },
      },
      "/notifications/{id}": {
        patch: { summary: "Mark notification read", tags: ["Notifications"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Updated" } } },
        delete: { summary: "Dismiss notification", tags: ["Notifications"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Deleted" } } },
      },
      "/bookmarks": {
        get: { summary: "List study bookmarks", tags: ["Workspace"], parameters: [{ name: "userId", in: "query", schema: { type: "string" } }], responses: { 200: { description: "Bookmark list" } } },
        post: { summary: "Create a bookmark", tags: ["Workspace"], responses: { 201: { description: "Bookmark created" } } },
      },
      "/annotations": {
        get: { summary: "List measurements/annotations", tags: ["Workspace"], parameters: [{ name: "studyId", in: "query" }, { name: "orthancStudyId", in: "query" }], responses: { 200: { description: "Annotation list" } } },
        post: { summary: "Save a measurement/annotation", tags: ["Workspace"], responses: { 201: { description: "Annotation created" } } },
      },
      "/orthanc/studies": {
        get: { summary: "List Orthanc PACS studies", tags: ["Orthanc"], responses: { 200: { description: "Study list (empty if Orthanc not configured)" } } },
      },
      "/orthanc/studies/{id}": {
        get: { summary: "Orthanc study detail with expanded series", tags: ["Orthanc"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Study detail" } } },
      },
      "/orthanc/series/{id}": {
        get: { summary: "Orthanc series detail with instances", tags: ["Orthanc"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Series detail" } } },
      },
      "/orthanc/worklist": {
        get: {
          summary: "Modality Worklist (MWL)",
          description: "Queries Orthanc worklist when configured; falls back to local scheduled appointments.",
          tags: ["Orthanc"],
          parameters: [
            { name: "modality", in: "query", schema: { type: "string" } },
            { name: "date", in: "query", schema: { type: "string", format: "date" } },
          ],
          responses: { 200: { description: "Worklist items" } },
        },
      },
      "/orthanc/health": {
        get: { summary: "Orthanc health monitoring", description: "Returns version, storage, jobs, plugins, modalities, peers.", tags: ["Orthanc"], responses: { 200: { description: "Health snapshot" } } },
      },
      "/orthanc/upload": {
        post: {
          summary: "Upload DICOM file(s) to Orthanc",
          description: "Multipart form with field 'files' containing .dcm files. Forwards via STOW-RS to Orthanc /instances.",
          tags: ["Orthanc"],
          requestBody: { content: { "multipart/form-data": { schema: { type: "object", properties: { files: { type: "array", items: { type: "string", format: "binary" } } } } } } },
          responses: { 200: { description: "Upload results" } },
        },
      },
      "/orthanc/proxy": {
        get: {
          summary: "Orthanc REST proxy",
          description: "Pass-through proxy to Orthanc. Use ?p=studies/<id>/instances/<iid>/preview for thumbnails, or p=dicom-web/... for DICOMweb.",
          tags: ["Orthanc"],
          parameters: [{ name: "p", in: "query", required: true, schema: { type: "string" }, description: "Orthanc path (e.g. studies/xxx/series)" }],
          responses: { 200: { description: "Proxied response" } },
        },
      },
      "/orthanc/patients/{id}": {
        get: { summary: "Patient metadata from Orthanc", tags: ["Orthanc"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Patient detail with study count" } } },
      },
      "/orthanc/routing": {
        post: {
          summary: "Route a study to modality or peer",
          description: "Sends a study via C-STORE to a configured modality or Orthanc peer.",
          tags: ["Orthanc"],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["studyId", "target"], properties: { studyId: { type: "string" }, target: { type: "string" }, type: { type: "string", enum: ["modality", "peer"], default: "modality" } } } } },
          },
          responses: { 200: { description: "Routing job submitted" } },
        },
      },
      "/orthanc/storage-commitment": {
        post: {
          summary: "Verify DICOM storage commitment",
          description: "Triggers N-ACTION storage commitment for a study's instances.",
          tags: ["Orthanc"],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["studyId"], properties: { studyId: { type: "string" } } } } },
          },
          responses: { 200: { description: "Commitment job submitted" } },
        },
      },
      "/orthanc/plugins": {
        get: { summary: "List Orthanc plugins and active jobs", tags: ["Orthanc"], responses: { 200: { description: "Plugin list" } } },
      },
      "/agents/chat": {
        post: {
          summary: "Chat with a specialised agent",
          description: "Dispatches to one of 9 independent agents: reception, scheduling, workflow, reporting, equipment, inventory, quality, executive, knowledge. Falls back to live-data simulation when LangGraph is offline.",
          tags: ["Agents"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["agent", "message"],
                  properties: {
                    agent: { type: "string", enum: ["reception", "scheduling", "workflow", "reporting", "equipment", "inventory", "quality", "executive", "knowledge"] },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Agent reply" } },
        },
      },
    },
    components: {
      parameters: {
        PageParam: {
          name: "page",
          in: "query",
          schema: { type: "integer", minimum: 1, default: 1 },
          description: "1-based page number (list contract).",
        },
        PageSizeParam: {
          name: "pageSize",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 200, default: 50 },
          description: "Rows per page (list contract).",
        },
        SortParam: {
          name: "sort",
          in: "query",
          schema: { type: "string" },
          description: "Sort column — only allowed where an allowlist is defined (see info.description); unknown values return 400.",
        },
        DirParam: {
          name: "dir",
          in: "query",
          schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
          description: "Sort direction (list contract).",
        },
      },
    },
    tags: [
      { name: "System", description: "Health checks and integration status" },
      { name: "Command Centre", description: "Real-time operational intelligence" },
      { name: "Events", description: "Event bus (Redis Streams + DB)" },
      { name: "Knowledge", description: "Organisational documentation platform" },
      { name: "Reporting", description: "AI-assisted radiology reporting" },
      { name: "AI Review", description: "Multi-modal AI observation review" },
      { name: "Decision Engine", description: "AI recommendation → approval → execution → audit" },
      { name: "Notifications", description: "System notifications" },
      { name: "Workspace", description: "Study bookmarks and annotations" },
      { name: "Orthanc", description: "PACS integration via Orthanc REST API" },
      { name: "Agents", description: "9 specialised operational agents" },
    ],
  };

  return NextResponse.json(spec, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
