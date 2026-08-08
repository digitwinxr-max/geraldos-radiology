/**
 * GeraldOS new-module seeder.
 *
 * Seeds report templates, knowledge documents, event history, notifications,
 * AI recommendations, AI observations, bookmarks and annotations. Each block is
 * isolated so a missing table never breaks the core seed (run `drizzle-kit push`
 * first to create the tables).
 */

import { db } from "@/db";
import {
  reportTemplates,
  knowledgeDocuments,
  eventLog,
  notifications,
  aiRecommendations,
  aiObservations,
  studyBookmarks,
  studyAnnotations,
  workflowStudies,
  patients,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { BUILT_IN_TEMPLATES } from "@/lib/reporting";

async function guard(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.warn(`[seed:${name}] skipped (${error instanceof Error ? error.message : String(error)})`);
  }
}

export async function seedNewModules(): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  // ── Report templates (only if the table is empty) ──
  await guard("report_templates", async () => {
    const [existing] = await db.select({ n: sql<number>`count(*)::int` }).from(reportTemplates);
    if (Number(existing.n) > 0) return;
    await db.insert(reportTemplates).values(
      BUILT_IN_TEMPLATES.map((t) => ({
        name: t.name,
        modality: t.modality,
        description: t.description,
        sections: t.sections,
        checklist: t.checklist,
        isSystem: true,
        active: true,
      }))
    );
  });

  // ── Knowledge documents ──
  await guard("knowledge_documents", async () => {
    const [existing] = await db.select({ n: sql<number>`count(*)::int` }).from(knowledgeDocuments);
    if (Number(existing.n) > 0) return;
    await db.insert(knowledgeDocuments).values([
      {
        title: "CT Contrast Administration Protocol",
        category: "protocol",
        docType: "protocol",
        summary: "Standard operating protocol for intravenous contrast administration across CT modalities.",
        content: "# CT Contrast Administration Protocol\n\n## Purpose\nEnsure consistent, safe administration of iodinated contrast for CT studies.\n\n## Indications\n- CT angiography\n- Staging studies (chest/abdomen/pelvis)\n- Brain CT with contrast where clinically indicated\n\n## Contraindications\n- Known severe anaphylactic reaction to iodinated contrast\n- Uncontrolled hyperthyroidism\n\n## Renal Function\n- eGFR < 30 mL/min: contrast only after nephrology consult\n- eGFR 30-45: hydration protocol and lowest diagnostic dose\n\n## Dose Reference\n- Omnipaque 350 (100 ml) for CT CAP\n- Omnipaque 300 (50 ml) for CT Brain\n\n## Steps\n- Verify patient identity and consent\n- Confirm renal function within 3 months\n- Insert IV cannula (20G minimum)\n- Administer at 2-4 ml/s via power injector\n- Observe for 30 minutes post-scan",
        tags: ["contrast", "ct", "safety", "renal"],
        version: "2.1",
        author: "Dr. Boitumelo Seretse",
        status: "published",
        approvedBy: "Clinical Director",
      },
      {
        title: "MRI Safety Screening Checklist",
        category: "sop",
        docType: "checklist",
        summary: "Pre-scan safety screening for all patients entering the MRI suite.",
        content: "# MRI Safety Screening Checklist\n\n## Purpose\nPrevent ferromagnetic projectiles and implant-related injuries in the MRI suite.\n\n## Steps\n- Screen for pacemakers, cochlear implants, neurostimulators (absolute contraindications)\n- Verify ferromagnetic foreign bodies (orbital metal, shrapnel)\n- Confirm implant MRI-conditional status with documentation\n- Remove all metal objects, wallets, phones and jewellery\n- Verify pregnancy status when applicable\n- Escort patient through the controlled access zone",
        tags: ["mri", "safety", "screening"],
        version: "1.4",
        author: "Lorato Sebina",
        status: "published",
        approvedBy: "Clinical Director",
      },
      {
        title: "CT Scanner 1 — Siemens SOMATOM Force Operator Manual (Excerpt)",
        category: "manual",
        docType: "manual",
        summary: "Daily start-up, shutdown and quality control procedures for CT Scanner 1.",
        content: "# Siemens SOMATOM Force — Daily Operations\n\n## Startup\n- Power on gantry UPS, then console\n- Log in with operator credentials\n- Verify detector temperature within range\n\n## Daily QC\n- Run air calibration if any drift is flagged\n- Perform phantom scan weekly (CT number accuracy)\n- Document tube warm-up after idle > 4 hours\n\n## Shutdown\n- End all active scans\n- Flush injector lines\n- Follow vendor power-down sequence",
        tags: ["ct", "manual", "qc", "siemens"],
        version: "3.0",
        author: "Tumelo Nkwe",
        status: "published",
        approvedBy: "Service Manager",
      },
      {
        title: "Radiation Safety — Patient Dose Optimisation Policy",
        category: "radiation",
        docType: "policy",
        summary: "ALARA principles, dose reference levels and paediatric dose reduction for all ionising modalities.",
        content: "# Radiation Safety Policy\n\n## Principles\n- Apply ALARA (as low as reasonably achievable) to every examination\n- Justify every exposure against the clinical indication\n\n## Dose Reference Levels\n- Adult CT head: CTDIvol ≤ 60 mGy\n- Adult CT chest: CTDIvol ≤ 25 mGy\n- Paediatric CT: use paediatric protocols and age-based kV\n\n## Responsibilities\n- Radiographers optimise exposure parameters per patient habitus\n- Radiologists review image quality feedback monthly\n- Quarterly audit of DRL compliance reported to the Quality Committee",
        tags: ["radiation", "safety", "alara", "dose"],
        version: "1.7",
        author: "Omphemetse Moilwa",
        status: "published",
        approvedBy: "Radiation Safety Officer",
      },
      {
        title: "Mammography Accreditation — Quality Assurance Procedure",
        category: "accreditation",
        docType: "standard",
        summary: "QA procedure aligned with accreditation requirements for screening mammography.",
        content: "# Mammography QA Procedure\n\n## Equipment QC\n- Weekly: phantom image quality check\n- Annual: full acceptance testing by medical physicist\n\n## Image Quality\n- Compression force documented per patient\n- Positioning criteria met on 95% of examinations\n- Reject rate reported monthly\n\n## Reporting\n- BI-RADS category assigned on every screening study\n- Recall rates tracked against benchmark (5-12%)",
        tags: ["mammography", "qa", "accreditation"],
        version: "2.2",
        author: "Dr. Thato Ramotswe",
        status: "published",
        approvedBy: "Accreditation Lead",
      },
      {
        title: "Patient Preparation Guide — Abdominal Ultrasound",
        category: "preparation",
        docType: "guide",
        summary: "Preparation instructions given to patients for abdominal ultrasound examinations.",
        content: "# Abdominal Ultrasound — Preparation\n\n## Before the Appointment\n- Fast for 6 hours (no food, no milk)\n- Water is permitted (2 glasses 1 hour before)\n- Take routine medications as normal\n\n## During the Scan\n- Wear comfortable two-piece clothing\n- Bring previous scans and referral letters\n\n## After the Scan\n- No restrictions — resume normal diet and activity",
        tags: ["ultrasound", "preparation", "patient"],
        version: "1.1",
        author: "Refilwe Mosinyi",
        status: "published",
        approvedBy: "Radiology Manager",
      },
      {
        title: "Urgent Result Notification SOP",
        category: "sop",
        docType: "sop",
        summary: "Timely communication pathway for critical and unexpected findings (adapted from RCR guidelines).",
        content: "# Urgent Result Notification SOP\n\n## Purpose\nEnsure critical findings reach the referring clinician without delay.\n\n## Categories\n- Category 1 (critical): immediate verbal communication required\n- Category 2 (unexpected): notification within 24 hours\n\n## Pathway\n- Radiologist identifies critical finding during review\n- Radiologist calls referring physician directly\n- Log the call with time, recipient and outcome\n- Draft report marked 'Preliminary' until confirmed\n\n## Responsibility\n- The reporting radiologist owns the communication pathway",
        tags: ["sop", "critical", "communication", "tat"],
        version: "1.3",
        author: "Dr. Kagiso Moeng",
        status: "published",
        approvedBy: "Clinical Director",
      },
      {
        title: "Contrast Extravasation Management Policy",
        category: "quality",
        docType: "policy",
        summary: "Immediate management and reporting pathway for intravenous contrast extravasation.",
        content: "# Contrast Extravasation Management\n\n## Immediate Actions\n- Stop injection immediately\n- Remove cannula, elevate the limb\n- Document volume estimated and symptoms\n\n## Assessment\n- Minor (no pain, good perfusion): observe and discharge with advice\n- Moderate (pain, swelling): cold compress, orthopaedic/plastic review if blistering\n- Severe (skin changes, compartment syndrome concern): urgent surgical review\n\n## Reporting\n- Complete an incident report within 24 hours\n- Review at the monthly quality meeting",
        tags: ["contrast", "extravasation", "safety", "quality"],
        version: "1.0",
        author: "Dr. Boitumelo Seretse",
        status: "published",
        approvedBy: "Clinical Director",
      },
    ]);
  });

  // ── Event history ──
  await guard("event_log", async () => {
    const [existing] = await db.select({ n: sql<number>`count(*)::int` }).from(eventLog);
    if (Number(existing.n) > 0) return;
    const now = new Date();
    const events = [
      { eventType: "patient.registered", aggregate: "patient", aggregateId: null, payload: { count: 8 }, occurredAt: new Date(now.getTime() - 3600_000) },
      { eventType: "appointment.created", aggregate: "appointment", aggregateId: null, payload: { count: 6 }, occurredAt: new Date(now.getTime() - 3300_000) },
      { eventType: "appointment.checked_in", aggregate: "appointment", aggregateId: null, payload: {}, occurredAt: new Date(now.getTime() - 2900_000) },
      { eventType: "study.started", aggregate: "study", aggregateId: null, payload: { modality: "CT" }, occurredAt: new Date(now.getTime() - 2400_000) },
      { eventType: "report.drafted", aggregate: "report", aggregateId: null, payload: {}, occurredAt: new Date(now.getTime() - 1900_000) },
      { eventType: "inventory.low_stock", aggregate: "inventory", aggregateId: null, payload: { items: 4 }, occurredAt: new Date(now.getTime() - 1500_000) },
      { eventType: "equipment.offline", aggregate: "equipment", aggregateId: null, payload: { name: "Fluoroscopy 1" }, occurredAt: new Date(now.getTime() - 1200_000) },
      { eventType: "decision.proposed", aggregate: "decision", aggregateId: null, payload: { agent: "scheduling" }, occurredAt: new Date(now.getTime() - 900_000) },
      { eventType: "study.completed", aggregate: "study", aggregateId: null, payload: { modality: "X-Ray" }, occurredAt: new Date(now.getTime() - 600_000) },
      { eventType: "report.signed", aggregate: "report", aggregateId: null, payload: {}, occurredAt: new Date(now.getTime() - 300_000) },
    ];
    await db.insert(eventLog).values(
      events.map((e) => ({ ...e, source: "seed" }))
    );
  });

  // ── Notifications ──
  await guard("notifications", async () => {
    const [existing] = await db.select({ n: sql<number>`count(*)::int` }).from(notifications);
    if (Number(existing.n) > 0) return;
    await db.insert(notifications).values([
      { title: "MRI Scanner 2 entered maintenance", body: "Gradient coil repair in progress. Scheduling agent has proposed slot reallocation.", type: "warning", severity: "high", link: "/equipment", read: false },
      { title: "Fluoroscopy 1 is offline", body: "X-ray tube replacement scheduled. Impact: fluoroscopy procedures delayed.", type: "alert", severity: "high", link: "/equipment", read: false },
      { title: "Low stock: IV Cannulas (20G)", body: "2 boxes remaining, minimum is 25. Inventory agent proposes a reorder.", type: "alert", severity: "medium", link: "/inventory", read: false },
      { title: "4 reports pending radiologist review", body: "Two drafts exceed 12-hour TAT. Review in the Reporting workspace.", type: "info", severity: "medium", link: "/reporting", read: false },
      { title: "AI review candidates ready", body: "3 candidate observations generated for CT Abdomen — awaiting accept/reject.", type: "info", severity: "normal", link: "/review", read: false },
    ]);
  });

  // ── AI recommendations (decision engine queue) ──
  await guard("ai_recommendations", async () => {
    const [existing] = await db.select({ n: sql<number>`count(*)::int` }).from(aiRecommendations);
    if (Number(existing.n) > 0) return;
    await db.insert(aiRecommendations).values([
      {
        agent: "scheduling",
        recommendation: "Reallocate the 11:30 fluoroscopy slot to X-Ray Room 1 (available 11:30-12:00).",
        rationale: "Fluoroscopy 1 is offline for tube replacement; X-Ray Room 1 has capacity.",
        priority: "urgent",
        status: "validated",
        ruleResults: [{ rule: "reallocation_requires_equipment_context", passed: true, detail: "equipmentId provided" }],
        validationResults: [{ validator: "decision-engine", passed: true }],
        targetModule: "notify",
        targetAction: "staff",
        targetPayload: { title: "Slot reallocation proposed", body: "Fluoroscopy 11:30 moved to X-Ray Room 1", link: "/scheduling" },
        requestedBy: "system-agent",
      },
      {
        agent: "inventory",
        recommendation: "Place reorder for IV Cannulas (20G) — 2 boxes remaining against minimum of 25.",
        rationale: "Consumption forecast projects stock-out within 3 days.",
        priority: "routine",
        status: "proposed",
        ruleResults: [],
        validationResults: [],
        targetModule: "notify",
        targetAction: "staff",
        targetPayload: { title: "Reorder advisory: IV Cannulas", body: "Stock at 8% of minimum. Order via supplier workflow.", link: "/inventory" },
        requestedBy: "system-agent",
      },
      {
        agent: "workflow",
        recommendation: "Assign the unassigned STAT study to an available radiologist for immediate review.",
        rationale: "STAT priority study is in the pipeline without a radiologist assigned.",
        priority: "stat",
        status: "proposed",
        ruleResults: [],
        validationResults: [],
        targetModule: "notify",
        targetAction: "staff",
        targetPayload: { title: "STAT study needs radiologist", body: "Assign an available radiologist to the unassigned STAT study.", link: "/workflow" },
        requestedBy: "system-agent",
      },
    ]);
  });

  // ── AI observations (review queue) ──
  await guard("ai_observations", async () => {
    const [existing] = await db.select({ n: sql<number>`count(*)::int` }).from(aiObservations);
    if (Number(existing.n) > 0) return;
    const [study] = await db.select().from(workflowStudies).where(sql`${workflowStudies.stage} = 'review'`).limit(1);
    await db.insert(aiObservations).values([
      {
        studyId: study?.id ?? null,
        modality: study?.modality ?? "CT",
        region: "Abdomen",
        category: "finding",
        description: "Focal low-density lesion suggested in the liver on portal venous phase. Verify enhancement pattern and margins directly on the images before reporting.",
        confidence: "72.0",
        suggestedDifferential: ["Simple cyst", "Haemangioma", "Hypovascular metastasis"],
        literatureRefs: ["Radiographics 2020; LI-RADS v2018 practical guide"],
        similarCaseIds: ["GH-CASE-1042"],
        status: "pending",
        modelVersion: "geraldos-review-1",
      },
      {
        studyId: study?.id ?? null,
        modality: study?.modality ?? "CT",
        region: "Image quality",
        category: "technical",
        description: "Portal venous phase timing within diagnostic range. Coverage adequate. No significant motion artefact detected.",
        confidence: "88.0",
        suggestedDifferential: [],
        literatureRefs: [],
        similarCaseIds: [],
        status: "pending",
        modelVersion: "geraldos-review-1",
      },
      {
        studyId: null,
        modality: "Mammography",
        region: "Left Breast",
        category: "finding",
        description: "Grouped pleomorphic calcifications suggested in the upper outer quadrant. Evaluate morphology and distribution on magnification views.",
        confidence: "65.0",
        suggestedDifferential: ["Benign (fibroadenoma, fat necrosis)", "Ductal carcinoma in situ (suspicious)", "Sclerosing adenosis"],
        literatureRefs: ["Radiology 2023; BI-RADS 5th edition calcification lexicon"],
        similarCaseIds: ["GH-CASE-0887"],
        status: "pending",
        modelVersion: "geraldos-review-1",
      },
    ]);
  });

  // ── Bookmarks + annotations (sample) ──
  await guard("study_bookmarks", async () => {
    const [existing] = await db.select({ n: sql<number>`count(*)::int` }).from(studyBookmarks);
    if (Number(existing.n) > 0) return;
    const [study] = await db.select().from(workflowStudies).limit(1);
    if (study) {
      await db.insert(studyBookmarks).values({
        userId: "local-user",
        studyId: study.id,
        label: "CT Abdomen — follow-up in 6 months",
        note: "Compare with prior staging study.",
      });
    }
  });

  await guard("study_annotations", async () => {
    const [existing] = await db.select({ n: sql<number>`count(*)::int` }).from(studyAnnotations);
    if (Number(existing.n) > 0) return;
    const [study] = await db.select().from(workflowStudies).where(sql`${workflowStudies.stage} = 'review'`).limit(1);
    if (study) {
      await db.insert(studyAnnotations).values({
        studyId: study.id,
        tool: "length",
        label: "Liver lesion 12 mm",
        data: { value: 12, units: "mm", points: [[120, 80], [140, 92]] },
        createdBy: "radiologist",
      });
    }
  });
}
