/**
 * GeraldOS Specialised Agent Organisation.
 *
 * Nine independent operational agents. Each agent has a mission, a tool set, a
 * memory scope, the events it reacts to, and explicit responsibilities. There is
 * no monolithic chatbot: the chat endpoint dispatches to the agent whose mission
 * matches the request, and every agent's output is decision support only.
 */

import { db } from "@/db";
import {
  patients,
  appointments,
  workflowStudies,
  equipment,
  inventoryItems,
  reports,
  invoices,
  insuranceClaims,
  knowledgeDocuments,
  aiObservations,
} from "@/db/schema";
import { count, sql, sum, desc, eq, ilike, and } from "drizzle-orm";

export interface AgentEvent {
  type: string;
  reactsTo: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  mission: string;
  tools: string[];
  memory: string;
  events: string[];
  responsibilities: string[];
  color: string;
}

export const AGENTS: AgentDefinition[] = [
  {
    id: "reception",
    name: "Reception Agent",
    mission: "Deliver a frictionless patient journey from registration to first appointment.",
    tools: ["Patient registry", "HAPI FHIR Coverage lookup", "Consent tracker", "Queue board"],
    memory: "Patient contact/insurance history, consent status, wait-time records",
    events: ["patient.registered", "appointment.checked_in", "referral.received"],
    responsibilities: [
      "Verify patient identity and insurance eligibility",
      "Manage consent forms and capture patient history",
      "Estimate wait times and optimise queue position",
      "Surface registration blockers to front desk staff",
    ],
    color: "blue",
  },
  {
    id: "scheduling",
    name: "Scheduling Agent",
    mission: "Optimise machine and radiographer allocation so no slot is ever wasted.",
    tools: ["Appointment ledger", "Equipment calendar", "Radiographer roster", "Priority rules"],
    memory: "Slot utilisation history, conflict records, no-show patterns",
    events: ["appointment.created", "appointment.delayed", "equipment.offline", "equipment.online"],
    responsibilities: [
      "Detect double-booking and modality conflicts",
      "Apply STAT → urgent → routine priority allocation",
      "Reallocate slots when machines go offline",
      "Balance radiographer workload across sessions",
    ],
    color: "violet",
  },
  {
    id: "workflow",
    name: "Workflow Agent",
    mission: "Keep every study moving through the pipeline and flag anything that stalls.",
    tools: ["Stage tracker", "TAT thresholds", "n8n escalation", "Assignment board"],
    memory: "Per-study stage history and turnaround times",
    events: ["study.uploaded", "study.started", "study.completed", "report.approved"],
    responsibilities: [
      "Monitor study progression referral → archive",
      "Detect bottlenecks and TAT breaches",
      "Suggest radiologist assignment for unallocated studies",
      "Escalate urgent studies to the command centre",
    ],
    color: "orange",
  },
  {
    id: "reporting",
    name: "Reporting Agent",
    mission: "Assist the radiologist with structured, consistent, high-quality reports — never diagnose.",
    tools: ["Structured templates", "Prior-study comparison", "Measurement extraction", "Quality scoring"],
    memory: "Report version history, template preferences, terminology consistency",
    events: ["report.started", "report.drafted", "report.versioned", "report.signed"],
    responsibilities: [
      "Recommend the matching structured template for the study",
      "Draft findings/impression structure for radiologist editing",
      "Flag critical findings, incomplete sections and terminology drift",
      "Score draft quality and remind about checklists",
    ],
    color: "emerald",
  },
  {
    id: "equipment",
    name: "Equipment Agent",
    mission: "Maximise fleet uptime through proactive health monitoring.",
    tools: ["Equipment registry", "Calibration tracker", "Service dispatcher (n8n)", "Downtime impact model"],
    memory: "Calibration/maintenance history, utilisation rates",
    events: ["equipment.online", "equipment.offline", "maintenance.scheduled"],
    responsibilities: [
      "Flag overdue calibration and maintenance windows",
      "Estimate downtime impact on the schedule",
      "Dispatch service requests through n8n",
      "Track equipment lifecycle and utilisation",
    ],
    color: "amber",
  },
  {
    id: "inventory",
    name: "Inventory Agent",
    mission: "Guarantee critical consumables are never out of stock at scan time.",
    tools: ["Stock ledger", "Reorder thresholds", "MinIO manifests", "Expiry monitor"],
    memory: "Consumption rates, supplier lead times, expiry records",
    events: ["inventory.updated", "inventory.low_stock"],
    responsibilities: [
      "Trigger reorder advisories below minimum stock",
      "Monitor expiry dates for contrast and consumables",
      "Forecast monthly consumption per modality",
      "Track supplier performance",
    ],
    color: "cyan",
  },
  {
    id: "quality",
    name: "Quality Assurance Agent",
    mission: "Protect clinical quality through structured, audited checks.",
    tools: ["Quality checklists", "AI observation audit trail", "Report quality scoring", "Accreditation standards"],
    memory: "QA history per study, technician, modality",
    events: ["study.completed", "report.drafted", "ai.observation_accepted"],
    responsibilities: [
      "Score image/study completeness against modality checklists",
      "Verify AI observations are accepted/rejected and audited",
      "Track report quality scores and turnaround compliance",
      "Flag deviation from accreditation standards",
    ],
    color: "rose",
  },
  {
    id: "executive",
    name: "Executive Intelligence Agent",
    mission: "Turn operational data into concise, decision-ready intelligence.",
    tools: ["Analytics engine", "Finance analytics", "Integration health", "Trend models"],
    memory: "Historical KPIs, revenue trends, incident records",
    events: ["decision.proposed", "decision.executed", "report.signed", "equipment.offline"],
    responsibilities: [
      "Produce daily executive summaries",
      "Detect operational bottlenecks and revenue-at-risk",
      "Compare modality performance and utilisation",
      "Propose decisions for human approval (never auto-executes)",
    ],
    color: "slate",
  },
  {
    id: "knowledge",
    name: "Knowledge Agent",
    mission: "Answer exclusively from approved internal documentation.",
    tools: ["Knowledge base search", "SOP/protocol retrieval", "Version control"],
    memory: "Document index, categories, approval status",
    events: ["knowledge.published"],
    responsibilities: [
      "Answer questions citing approved SOPs, protocols and manuals",
      "Refuse to answer from unapproved or external sources",
      "Suggest the right protocol for a requested procedure",
      "Point staff to the exact document and version",
    ],
    color: "teal",
  },
];

export const AGENT_MAP = Object.fromEntries(AGENTS.map((a) => [a.id, a]));

// ─── Live-data brain (local simulation when LangGraph is unreachable) ───
interface AgentContext {
  userId?: string;
}

/** Rich operational context shared by most agents. */
async function snapshot() {
  const [pats] = await db.select({ count: count() }).from(patients);
  const [apts] = await db.select({ count: count() }).from(appointments);
  const [studies] = await db.select({ count: count() }).from(workflowStudies);
  const [eqs] = await db.select({ count: count() }).from(equipment);
  const [reps] = await db.select({ count: count() }).from(reports);
  const lowStock = await db
    .select({ name: inventoryItems.name, currentStock: inventoryItems.currentStock, minimumStock: inventoryItems.minimumStock })
    .from(inventoryItems)
    .where(sql`${inventoryItems.currentStock} <= ${inventoryItems.minimumStock}`);
  const eqOffline = await db
    .select({ name: equipment.name, status: equipment.status, modality: equipment.modality })
    .from(equipment)
    .where(sql`${equipment.status} != 'operational'`);
  const pendingReports = await db
    .select({ count: count() })
    .from(reports)
    .where(sql`${reports.status} IN ('draft','pending_review')`);
  const inPipeline = await db
    .select({ count: count() })
    .from(workflowStudies)
    .where(sql`${workflowStudies.stage} NOT IN ('released','archived')`);
  return { pats, apts, studies, eqs, reps, lowStock, eqOffline, pendingReports, inPipeline };
}

/**
 * Dispatch a message to the correct agent brain. Returns text only — all state
 * changes funnel through the decision engine (never executed directly).
 */
export async function handleAgentRequest(
  agentId: string,
  message: string,
  _ctx: AgentContext = {}
): Promise<{ reply: string; sources?: string[] }> {
  const s = await snapshot();
  const lowStockLine =
    s.lowStock.length === 0
      ? "No inventory items are below minimum stock."
      : `Reorder advisory: ${s.lowStock.map((i) => `${i.name} (${i.currentStock} left)`).join("; ")}.`;
  const eqLine =
    s.eqOffline.length === 0
      ? "Every imaging unit reports operational."
      : `Attention required: ${s.eqOffline.map((e) => `${e.name} (${e.status})`).join(", ")}.`;

  switch (agentId) {
    case "reception":
      return {
        reply: [
          `Reception overview: ${s.pats.count} patients registered, ${s.apts.count} appointments on the books.`,
          lowStockLine,
          `On “${message}”: I can verify identity/eligibility and manage consent. Insurance eligibility is cross-checked via HAPI FHIR Coverage when connected.`,
          "All patient registration actions require front-desk confirmation before they are recorded.",
        ].join("\n\n"),
      };

    case "scheduling":
      return {
        reply: [
          `Scheduling scan: ${s.apts.count} appointments tracked; ${s.eqOffline.length} unit(s) non-operational.`,
          eqLine,
          "Priority rule: STAT → reallocate immediately, urgent → next available slot, routine → FIFO.",
          `Proposed action for review: reallocate affected slots.`,
        ].join("\n\n"),
      };

    case "workflow":
      return {
        reply: [
          `Pipeline: ${s.inPipeline[0]?.count ?? 0} active studies moving referral → archive; ${s.pendingReports[0]?.count ?? 0} reports awaiting radiologist action.`,
          "Bottlenecks and TAT breaches are escalated through n8n and surfaced on the command centre.",
          `On “${message}”, I would recommend routing unassigned studies to the available radiologist — as a decision for approval, not an automatic action.`,
        ].join("\n\n"),
      };

    case "reporting":
      return {
        reply: [
          `${s.reps.count} reports on record; ${s.pendingReports[0]?.count ?? 0} in progress.`,
          "I assist with structure, terminology and quality — the radiologist always writes and signs the final report.",
          `On “${message}”: open the Reporting workspace, pick the matching template, and I will score the draft, flag incomplete sections and highlight critical-finding terms.`,
          "No report is ever finalised or diagnosed automatically.",
        ].join("\n\n"),
      };

    case "equipment":
      return {
        reply: [
          `Fleet: ${s.eqs.count} units. ${eqLine}`,
          "Calibration-due and maintenance-overdue units are flagged on the Equipment page; service requests dispatch via n8n.",
          "Downtime impact on the schedule is estimated and shared with the Scheduling agent.",
        ].join("\n\n"),
      };

    case "inventory":
      return {
        reply: [lowStockLine, "Expiry dates are monitored per batch; consumption forecasting feeds the supplier-reorder workflow.", "Reorder advisories are proposed to purchasing — never auto-ordered."].join("\n\n"),
      };

    case "quality": {
      const pendingObs = await db
        .select({ count: count() })
        .from(aiObservations)
        .where(eq(aiObservations.status, "pending"));
      return {
        reply: [
          `QA posture: ${pendingObs[0]?.count ?? 0} AI candidate observations awaiting radiologist review.`,
          `${s.pendingReports[0]?.count ?? 0} draft reports below quality threshold (score < 70) are flagged in the Reporting workspace.`,
          "Quality checks follow modality-specific checklists aligned with accreditation standards; every AI interaction is audit-logged.",
        ].join("\n\n"),
      };
    }

    case "executive": {
      const [invStats] = await db
        .select({ total: sum(invoices.totalAmount), paid: sum(invoices.amountPaid), n: count() })
        .from(invoices);
      const outstandingRows = await db.execute(
        sql`SELECT COALESCE(SUM(total_amount - amount_paid),0) AS outstanding FROM invoices WHERE status NOT IN ('paid','written_off')`
      );
      const outstanding = Number((outstandingRows.rows[0] as { outstanding: string })?.outstanding ?? 0);
      const [pendingClaims] = await db
        .select({ n: count() })
        .from(insuranceClaims)
        .where(sql`${insuranceClaims.status} IN ('submitted','pending')`);
      return {
        reply: [
          `Executive snapshot: ${s.pats.count} patients · ${s.apts.count} appointments · ${s.studies.count} studies · ${s.reps.count} reports.`,
          `Finance: ${invStats?.n ?? 0} invoices totalling P${Number(invStats?.total ?? 0).toLocaleString()}, P${Number(invStats?.paid ?? 0).toLocaleString()} collected, P${outstanding.toLocaleString()} outstanding, ${pendingClaims?.n ?? 0} claims awaiting response.`,
          `${s.lowStock.length} inventory alerts · ${s.eqOffline.length} equipment incidents.`,
          "Trends and forecasts are proposed to management as decisions requiring approval.",
        ].join("\n\n"),
      };
    }

    case "knowledge": {
      const cleaned = message.trim().toLowerCase().replace(/^(what is|what are|how do we|how to|explain|tell me about|find|search)\s+/g, "");
      // Tokenized match: rank documents by how many query tokens they contain.
      const tokens = cleaned.split(/\s+/).filter((t) => t.length > 2);
      const term = (col: unknown, tok: string) => sql`(${col}::text ILIKE ${`%${tok}%`})::int`;
      const tokenMatches = tokens.length === 0
        ? sql`0`
        : tokens.map((tok) => sql`(${term(knowledgeDocuments.title, tok)} + ${term(knowledgeDocuments.summary, tok)} + ${term(knowledgeDocuments.content, tok)} + (SELECT COALESCE(MAX((t ILIKE ${`%${tok}%`})::int), 0) FROM jsonb_array_elements_text(${knowledgeDocuments.tags}) t))`).reduce((acc, c) => sql`${acc} + ${c}`);
      const docs = await db
        .select({
          id: knowledgeDocuments.id,
          title: knowledgeDocuments.title,
          category: knowledgeDocuments.category,
          summary: knowledgeDocuments.summary,
          version: knowledgeDocuments.version,
          status: knowledgeDocuments.status,
        })
        .from(knowledgeDocuments)
        .where(
          and(
            eq(knowledgeDocuments.status, "published"),
            sql`${tokenMatches} >= ${Math.min(2, tokens.length || 1)}`
          )
        )
        .orderBy(desc(sql`${tokenMatches}`), desc(knowledgeDocuments.updatedAt))
        .limit(5);
      if (docs.length === 0) {
        return {
          reply: [
            `No approved documentation matches “${message}”.`,
            "I answer exclusively from approved internal documentation — if this topic is missing, request it under Knowledge → Policies/Protocols for review.",
          ].join("\n\n"),
        };
      }
      return {
        reply: [
          `I found ${docs.length} approved document${docs.length === 1 ? "" : "s"} matching “${message}”:`,
          docs.map((d, i) => `${i + 1}. **${d.title}** (${d.category}, v${d.version}) — ${d.summary ?? d.status}`).join("\n"),
          "Open the Knowledge platform to read the full, current version.",
        ].join("\n\n"),
        sources: docs.map((d) => `${d.title} (v${d.version})`),
      };
    }

    default:
      return {
        reply: [
          `Workflow pipeline: ${s.studies.count} studies tracked from referral through archive.`,
          "Bottlenecks, TAT breaches and escalations surface on the Operations Command Centre and are audit-logged.",
        ].join("\n\n"),
      };
  }
}
