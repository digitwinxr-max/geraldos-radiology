/**
 * GeraldOS Reporting Assistant — decision support for radiologists.
 *
 * This module NEVER issues a diagnosis and NEVER finalises a report. It provides
 * structured templates, draft structure, checklist reminders, quality scoring and
 * terminology checks. Every AI suggestion requires radiologist confirmation.
 */

export interface TemplateSection {
  name: string;
  hint?: string;
}

export interface ReportTemplate {
  id: string;
  name: string;
  modality: string;
  description: string;
  sections: TemplateSection[];
  checklist: string[];
  isSystem?: boolean;
}

/** Built-in structured reporting templates (DB templates override/extend these). */
export const BUILT_IN_TEMPLATES: ReportTemplate[] = [
  {
    id: "cxr-standard",
    name: "Chest X-Ray Standard",
    modality: "X-Ray",
    description: "PA/Lateral chest radiograph with structured interpretation.",
    sections: [
      { name: "Clinical History", hint: "Indication and relevant history from the referral." },
      { name: "Comparison", hint: "Prior studies reviewed and date." },
      { name: "Technique", hint: "Projections, patient position, image quality." },
      { name: "Findings", hint: "Organised by system: airways, lungs, pleura, mediastinum, heart, bones." },
      { name: "Impression", hint: "Concise summary of clinically relevant findings." },
    ],
    checklist: [
      "Compare with prior examinations when available",
      "Comment on lines, tubes and foreign bodies",
      "Assess lung apices, costophrenic angles and cardiac silhouette",
      "State whether findings are acute or chronic",
    ],
  },
  {
    id: "ct-brain-standard",
    name: "CT Brain Standard",
    modality: "CT",
    description: "Non-contrast / contrast-enhanced CT brain.",
    sections: [
      { name: "Clinical History" },
      { name: "Comparison" },
      { name: "Technique", hint: "Slice thickness, contrast administration." },
      { name: "Findings", hint: "Extra-axial, brain parenchyma, ventricles, basal cisterns, bones, paranasal sinuses." },
      { name: "Impression" },
      { name: "Recommendation" },
    ],
    checklist: [
      "Assess for acute haemorrhage (extradural, subdural, subarachnoid, intraparenchymal)",
      "Check midline shift and mass effect",
      "Review ventricles for hydrocephalus",
      "Comment on grey-white differentiation and signs of infarction",
    ],
  },
  {
    id: "ct-cap-standard",
    name: "CT Chest/Abdomen/Pelvis",
    modality: "CT",
    description: "Combined oncological / trauma staging.",
    sections: [
      { name: "Clinical History" },
      { name: "Comparison" },
      { name: "Technique" },
      { name: "Chest Findings", hint: "Lungs, mediastinum, pleura, chest wall." },
      { name: "Abdomen Findings", hint: "Liver, pancreas, kidneys, spleen, adrenals, bowel." },
      { name: "Pelvis Findings", hint: "Bladder, uterus/prostate, adnexa, nodes." },
      { name: "Impression" },
    ],
    checklist: [
      "Comment on lung nodules and their features",
      "Assess lymph node stations",
      "Review solid organs with contrast phases in mind",
      "Comment on bone lesions and incidental findings",
    ],
  },
  {
    id: "mri-brain-standard",
    name: "MRI Brain Standard",
    modality: "MRI",
    description: "Routine MRI brain with contrast.",
    sections: [
      { name: "Clinical History" },
      { name: "Comparison" },
      { name: "Technique", hint: "Sequences performed, contrast." },
      { name: "Sequences", hint: "Quality of each sequence, artefacts." },
      { name: "Findings", hint: "Intra-axial, extra-axial, ventricles, vessels, pituitary, posterior fossa." },
      { name: "Impression" },
    ],
    checklist: [
      "Assess for acute ischaemia using DWI/ADC",
      "Comment on demyelinating plaques and their location",
      "Review flow voids and vessels",
      "Assess enhancement patterns if contrast given",
    ],
  },
  {
    id: "mri-knee-standard",
    name: "MRI Knee Standard",
    modality: "MRI",
    description: "MRI knee joint with meniscal and ligamentous assessment.",
    sections: [
      { name: "Clinical History" },
      { name: "Comparison" },
      { name: "Technique" },
      { name: "Menisci", hint: "Medial and lateral, body/horn involvement, tear pattern." },
      { name: "Ligaments", hint: "ACL, PCL, MCL, LCL, posterolateral corner." },
      { name: "Cartilage", hint: "Chondral surfaces, grade." },
      { name: "Bone", hint: "Bone marrow oedema, fractures, alignment." },
      { name: "Other", hint: "Effusion, synovium, popliteal cyst." },
      { name: "Impression" },
    ],
    checklist: [
      "Report each meniscus in all three zones",
      "State ACL integrity and any partial/full tear",
      "Grade chondral loss with a classification",
      "Look for associated bone bruising",
    ],
  },
  {
    id: "us-abdomen-standard",
    name: "Ultrasound Abdomen",
    modality: "Ultrasound",
    description: "Abdominal ultrasound survey.",
    sections: [
      { name: "Clinical History" },
      { name: "Comparison" },
      { name: "Technique", hint: "Fasting status, transducer used." },
      { name: "Liver", hint: "Size, echogenicity, focal lesions, portal vein." },
      { name: "Gallbladder", hint: "Wall, stones, CBD." },
      { name: "Kidneys", hint: "Size, cortex, hydronephrosis, stones." },
      { name: "Spleen" },
      { name: "Pancreas" },
      { name: "Aorta", hint: "Diameter." },
      { name: "Impression" },
    ],
    checklist: [
      "Measure main organs where indicated",
      "Document any focal liver lesion with characteristics",
      "Assess for hydronephrosis and renal stones",
      "Comment on aortic diameter",
    ],
  },
  {
    id: "mammo-screening",
    name: "Mammography Screening",
    modality: "Mammography",
    description: "Screening mammogram with BI-RADS.",
    sections: [
      { name: "Clinical History" },
      { name: "Comparison" },
      { name: "Breast Composition", hint: "BI-RADS density category a–d." },
      { name: "Findings", hint: "Mass, calcifications, asymmetry, architectural distortion per side." },
      { name: "BI-RADS", hint: "Final assessment category 0–6." },
      { name: "Recommendation" },
    ],
    checklist: [
      "Compare with prior mammograms",
      "Categorise breast density",
      "Describe any mass with margin and shape",
      "Assign BI-RADS category and recommendation",
    ],
  },
];

export const TEMPLATES_BY_MODALITY = BUILT_IN_TEMPLATES;

// ─── Terminology consistency ───
export const TERMINOLOGY_MAP: Record<string, string> = {
  "microcalcifications": "microcalcifications",
  "microlithiasis": "microcalcifications",
  "opacity": "opacity",
  "opacification": "opacity",
  "cerebral haemorrhage": "intracranial haemorrhage",
  "brain bleed": "intracranial haemorrhage",
  "avascular necrosis": "avascular necrosis",
  "bone infarct": "avascular necrosis",
  "pneumothorax": "pneumothorax",
  "collapsed lung": "pneumothorax",
  "effusion": "effusion",
  "edema": "oedema",
  "oedema": "oedema",
  "tumor": "tumour",
  "tumour": "tumour",
  "fracture": "fracture",
  "break": "fracture",
};

export const CRITICAL_FINDINGS_TERMS = [
  "pneumothorax",
  "tension pneumothorax",
  "intracranial haemorrhage",
  "subarachnoid haemorrhage",
  "aortic dissection",
  "pulmonary embolism",
  "massive effusion",
  "bowel perforation",
  "free intraperitoneal air",
  "acute stroke",
  "spinal cord compression",
  "malignant",
  "metastatic disease",
  "complete heart block",
];

// ─── Draft assistance ───
export interface AssistRequest {
  templateId?: string;
  modality?: string;
  procedure?: string;
  clinicalIndication?: string;
  priorImpression?: string;
}

export interface AssistResult {
  template: ReportTemplate;
  suggestedSections: { name: string; hint?: string }[];
  checklist: string[];
  bodyPartHints: string[];
  reminder: string;
}

/** Recommend a template and prepare a structured shell for the radiologist. */
export function prepareDraft(request: AssistRequest): AssistResult {
  const template =
    BUILT_IN_TEMPLATES.find((t) => t.id === request.templateId) ??
    (request.modality ? BUILT_IN_TEMPLATES.find((t) => t.modality === request.modality) : undefined) ??
    BUILT_IN_TEMPLATES[0];

  const bodyPartHints: string[] = [];
  if (request.procedure) {
    const p = request.procedure.toLowerCase();
    if (p.includes("brain") || p.includes("head")) bodyPartHints.push("Cover the brain parenchyma, ventricles, basal cisterns, and extra-axial spaces.");
    if (p.includes("chest") || p.includes("lung")) bodyPartHints.push("Assess airways, lung parenchyma, pleura, mediastinum, hila and bony cage.");
    if (p.includes("abdomen") || p.includes("pelvis")) bodyPartHints.push("Review solid organs, bowel, mesentery, vessels and pelvic structures.");
    if (p.includes("knee")) bodyPartHints.push("Assess menisci, cruciate and collateral ligaments, cartilage and bone.");
    if (p.includes("spine") || p.includes("lumbar")) bodyPartHints.push("Review vertebral bodies, disc spaces, canal, and neural foramina.");
  }

  return {
    template,
    suggestedSections: template.sections,
    checklist: template.checklist,
    bodyPartHints,
    reminder: "This is decision support only. Review every AI suggestion and confirm before saving. The radiologist makes the final diagnosis.",
  };
}

// ─── Quality scoring ───
export interface ScoreInput {
  findings?: string | null;
  impression?: string | null;
  recommendation?: string | null;
  template?: ReportTemplate | null;
}

export interface QualityBreakdown {
  checks: { label: string; passed: boolean; weight: number }[];
  score: number;
}

const SECTION_LENGTH = 40;

export function scoreReport(input: ScoreInput): QualityBreakdown {
  const checks: { label: string; passed: boolean; weight: number }[] = [];
  const findings = (input.findings ?? "").trim();
  const impression = (input.impression ?? "").trim();
  const recommendation = (input.recommendation ?? "").trim();

  checks.push({ label: "Findings section has substantive content", passed: findings.length >= SECTION_LENGTH, weight: 25 });
  checks.push({ label: "Impression is present and non-generic", passed: impression.length >= 20 && !/^(n|no|nil|none|\s*)$/i.test(impression), weight: 25 });
  checks.push({ label: "Impression is not an exact copy of findings", passed: impression.length > 0 && impression !== findings, weight: 10 });
  checks.push({ label: "Recommendation recorded when template requires it", passed: (input.template?.sections.some((s) => s.name.toLowerCase().includes("recommendation"))) ? recommendation.length > 0 : true, weight: 10 });
  checks.push({ label: "No placeholder text left in the report", passed: !/(lorem|xxx|\[.*\]|todo|tbd)/i.test(`${findings} ${impression}`), weight: 10 });
  checks.push({ label: "Terminology is consistent (BRITISH_ENG)", passed: !/\b(edema|tumor|opacification|brain bleed|collapsed lung)\b/i.test(`${findings} ${impression}`), weight: 10 });
  checks.push({ label: "Report not signed prematurely", passed: input.impression !== undefined, weight: 10 });

  const totalWeight = checks.reduce((a, c) => a + c.weight, 0);
  const earned = checks.reduce((a, c) => a + (c.passed ? c.weight : 0), 0);
  return { checks, score: Math.round((earned / totalWeight) * 100) };
}

/** Flags incomplete reports for the quality gate. */
export function isIncomplete(input: ScoreInput): string[] {
  const issues: string[] = [];
  const { checks } = scoreReport(input);
  for (const c of checks) {
    if (!c.passed) issues.push(c.label);
  }
  return issues;
}

/** Extract measurements (e.g. "12 mm", "3.4 cm", "5x4x3 cm") from free text. */
export function extractMeasurements(text: string): string[] {
  const matches = text.match(/\d+(?:[.,]\d+)?\s*(?:mm|cm|mL|mm Hg)?/g) ?? [];
  return [...new Set(matches)].filter((m) => /\d/.test(m) && (/(mm|cm|mL)/i.test(m) || /\d+[.,]\d+/.test(m))).slice(0, 20);
}

/** Detect critical-finding terminology in draft text for highlighting. */
export function detectCriticalFindings(text: string): string[] {
  const lower = text.toLowerCase();
  return CRITICAL_FINDINGS_TERMS.filter((t) => lower.includes(t));
}

/** Flag terminology that should be normalised (decision support only). */
export function terminologyDrift(text: string): { term: string; suggested: string }[] {
  const lower = text.toLowerCase();
  const drift: { term: string; suggested: string }[] = [];
  for (const [term, canonical] of Object.entries(TERMINOLOGY_MAP)) {
    if (term === canonical) continue;
    // Word-boundary match: "oedema" must not match "edema", "tumour" must not match "tumor".
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`).test(lower)) drift.push({ term, suggested: canonical });
  }
  return drift;
}
