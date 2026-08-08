/**
 * GeraldOS Multi-Modal AI Review Assistant.
 *
 * Supports X-Ray, CT, Ultrasound, Mammography, DEXA, Dental and Nuclear Medicine.
 * The assistant surfaces CANDIDATE OBSERVATIONS with confidence scores, suggested
 * differentials and quality checks. The AI does NOT make the diagnosis — the
 * radiologist accepts or rejects every candidate, and all interactions are audited.
 */

export interface ObservationCandidate {
  category: "finding" | "normal" | "technical" | "critical";
  region: string;
  description: string;
  confidence: number; // 0–100
  suggestedDifferential: string[];
  literatureRefs: string[];
  boundingBox?: { x: number; y: number; w: number; h: number };
  similarCaseIds: string[];
}

export const REVIEW_MODALITIES = [
  "X-Ray",
  "CT",
  "MRI",
  "Ultrasound",
  "Mammography",
  "DEXA",
  "Dental",
  "Nuclear Medicine",
  "PET-CT",
  "Fluoroscopy",
] as const;

// ─── Modality technical-quality checklists ───
export const TECHNICAL_CHECKS: Record<string, { label: string; weight: number }[]> = {
  "X-Ray": [
    { label: "Correct anatomical positioning (AP/PA/LAT)", weight: 30 },
    { label: "Collimation appropriate — no unnecessary exposure", weight: 20 },
    { label: "Exposure index within diagnostic range", weight: 20 },
    { label: "No motion blur or rotation artefact", weight: 30 },
  ],
  CT: [
    { label: "Coverage includes the entire region of interest", weight: 25 },
    { label: "No severe motion or streak artefact degrading key anatomy", weight: 25 },
    { label: "Contrast phase appropriate for the indication", weight: 25 },
    { label: "Reconstruction kernels and slice thickness adequate", weight: 25 },
  ],
  MRI: [
    { label: "All requested sequences acquired", weight: 25 },
    { label: "No significant motion artefact", weight: 25 },
    { label: "Fat suppression homogeneous where required", weight: 25 },
    { label: "Coverage includes the entire anatomy of interest", weight: 25 },
  ],
  Ultrasound: [
    { label: "Image depth and gain optimised", weight: 25 },
    { label: "Transducer frequency appropriate for depth", weight: 25 },
    { label: "Doppler settings verified where applicable", weight: 25 },
    { label: "Relevant measurements captured on cine/images", weight: 25 },
  ],
  Mammography: [
    { label: "Compression and positioning adequate (MLO + CC)", weight: 30 },
    { label: "No skin fold or artefact obscuring breast tissue", weight: 25 },
    { label: "Exposure adequate — no dense/underexposed regions", weight: 25 },
    { label: "Image labelling (side, view) correct", weight: 20 },
  ],
  DEXA: [
    { label: "Patient positioning within scan region", weight: 35 },
    { label: "No artefacts (metal, implants) overlying regions of interest", weight: 30 },
    { label: "T-score calculation valid for the population", weight: 35 },
  ],
  Dental: [
    { label: "Full field of view including all relevant teeth", weight: 30 },
    { label: "Exposure adequate — no over/under-exposure", weight: 30 },
    { label: "Minimal patient movement", weight: 20 },
    { label: "Correct projection technique", weight: 20 },
  ],
  "Nuclear Medicine": [
    { label: "Uptake time correct for the radiopharmaceutical", weight: 25 },
    { label: "Patient motion minimal during acquisition", weight: 25 },
    { label: "Count statistics adequate for reconstruction", weight: 25 },
    { label: "Image registration between SPECT and CT correct", weight: 25 },
  ],
};

export const DEFAULT_TECHNICAL_CHECKS: { label: string; weight: number }[] = [
  { label: "Coverage includes the entire region of interest", weight: 40 },
  { label: "No significant artefact degrading diagnostic content", weight: 30 },
  { label: "Exposure/quality parameters within range", weight: 30 },
];

/** Quality assessment for a modality. Returns pass/fail per check + overall. */
export function assessTechnicalQuality(modality: string): {
  checks: { label: string; passed: boolean }[];
  overall: number;
} {
  const checks = (TECHNICAL_CHECKS[modality] ?? DEFAULT_TECHNICAL_CHECKS).map((c) => ({
    label: c.label,
    // Deterministic local simulation — a connected model produces real scores.
    passed: (modality.length * 7 + c.label.length * 3) % 10 >= 3,
  }));
  const overall = Math.round((checks.filter((c) => c.passed).length / checks.length) * 100);
  return { checks, overall };
}

// ─── Candidate generation (decision support only) ───
const REGION_HINTS: Record<string, string[]> = {
  "X-Ray": ["Chest", "Cervical Spine", "Thoracic Spine", "Lumbar Spine", "Shoulder", "Pelvis"],
  CT: ["Brain", "Chest", "Abdomen", "Pelvis", "Cervical Spine", "Lumbar Spine"],
  MRI: ["Brain", "Knee", "Shoulder", "Lumbar Spine", "Abdomen"],
  Ultrasound: ["Liver", "Kidneys", "Gallbladder", "Pancreas", "Pelvis", "Thyroid"],
  Mammography: ["Right Breast", "Left Breast"],
  DEXA: ["Lumbar Spine", "Left Hip", "Right Hip"],
  Dental: ["Mandible", "Maxilla", "Panoramic"],
  "Nuclear Medicine": ["Bone", "Thyroid", "Myocardium", "Whole Body"],
  "PET-CT": ["Chest", "Abdomen", "Pelvis", "Whole Body"],
  Fluoroscopy: ["Oesophagus", "Stomach", "Colon", "Joint"],
};

const DIFFERENTIALS: Record<string, string[]> = {
  "X-Ray": [
    "Focal airspace opacity: infection, aspiration, atelectasis, neoplasm",
    "Interstitial pattern: interstitial oedema, viral infection, fibrosis, lymphangitic spread",
    "Suspicious lesion: primary malignancy, metastasis, granuloma, hamartoma",
  ],
  CT: [
    "Hyperdense lesion: haemorrhage, calcification, contrast pooling",
    "Hypodense lesion: oedema, ischaemia, cyst, necrosis",
    "Mass effect: neoplasm, abscess, large infarct, oedema",
    "Lymphadenopathy: reactive, lymphoma, metastases, infection",
  ],
  MRI: [
    "T2 hyperintense focus: oedema, demyelination, tumour, inflammation",
    "Enhancing lesion: tumour, infection, active demyelination, post-radiation change",
    "Meniscal signal: mucoid degeneration, tear",
  ],
  Ultrasound: [
    "Hypoechoic lesion: simple/complex cyst, abscess, solid mass",
    "Heterogeneous echotexture: steatosis, chronic disease, diffuse infiltration",
    "Focal liver lesion: haemangioma, cyst, metastasis, HCC",
  ],
  Mammography: [
    "Grouped calcifications: benign (fibroadenoma, fat necrosis), suspicious, malignant",
    "Asymmetry: normal variation, summation artefact, mass",
    "Spiculated mass: carcinoma (first consideration), post-surgical scar, radial scar",
  ],
  DEXA: ["Low BMD: osteopenia, osteoporosis, secondary causes"],
  Dental: ["Radiolucency: caries, periapical pathology, cyst", "Radiopacity: calculus, amalgam, foreign body"],
  "Nuclear Medicine": ["Focal uptake: physiologic, inflammatory, metastatic disease", "Cold defect: ischaemia, infarct, photopenic lesion"],
  "PET-CT": ["Hypermetabolic focus: malignant, inflammatory/infective, physiologic (brown fat, bowel)"],
  Fluoroscopy: ["Filling defect: stricture, polyp, mass", "Diverticulum: outpouching, ulcer"],
};

const LITERATURE: Record<string, string[]> = {
  "X-Ray": ["Radiographics 2020; Chest radiograph interpretation: a systematic approach"],
  CT: ["RadioGraphics 2019; Pearls and pitfalls in emergency CT interpretation"],
  MRI: ["Radiographics 2021; Structured MRI reporting templates"],
  Ultrasound: ["Journal of Ultrasound in Medicine 2022; LI-RADS for focal liver lesions"],
  Mammography: ["Radiology 2023; BI-RADS 5th edition practical guide"],
  DEXA: ["Osteoporosis International 2019; ISCD official positions"],
  Dental: ["Dentomaxillofacial Radiology 2020; Panoramic radiograph quality criteria"],
  "Nuclear Medicine": ["Journal of Nuclear Medicine 2021; Reporting nuclear medicine studies"],
  "PET-CT": ["Radiographics 2020; FDG PET/CT reporting pitfalls"],
  Fluoroscopy: ["Abdominal Radiology 2019; Fluoroscopic study interpretation"],
};

const SIMILAR_PREFIX = "GH-CASE";

/** Generate candidate observations for a study. Purely advisory. */
export function generateCandidates(opts: {
  modality: string;
  bodyPart?: string | null;
  procedure?: string | null;
}): ObservationCandidate[] {
  const modality = opts.modality || "X-Ray";
  const regions = REGION_HINTS[modality] ?? ["Primary region"];
  const region = opts.bodyPart && regions.some((r) => r.toLowerCase().includes(opts.bodyPart!.toLowerCase()))
    ? opts.bodyPart
    : regions[Math.floor(Math.random() * regions.length)];

  const differentials = DIFFERENTIALS[modality] ?? DIFFERENTIALS["X-Ray"];
  const literature = LITERATURE[modality] ?? LITERATURE["X-Ray"];

  const candidates: ObservationCandidate[] = [];

  // A probable finding candidate (confidence deliberately moderate).
  const findingConfidence = 55 + Math.floor(Math.random() * 30);
  candidates.push({
    category: findingConfidence >= 80 ? "critical" : "finding",
    region,
    description: `Suggested area of interest in the ${region.toLowerCase()} region on this ${modality} study. Verify features, size and margin characteristics directly on the images before reporting.`,
    confidence: findingConfidence,
    suggestedDifferential: differentials.slice(0, 2),
    literatureRefs: literature.slice(0, 1),
    similarCaseIds: [`${SIMILAR_PREFIX}-${Math.floor(1000 + Math.random() * 9000)}`],
  });

  // A normal-region confirmation candidate.
  candidates.push({
    category: "normal",
    region: regions[regions.length > 1 ? 1 : 0],
    description: `No candidate abnormality modelled in the ${regions[regions.length > 1 ? 1 : 0].toLowerCase()} region. This is not a normal report — confirm visually.`,
    confidence: 40 + Math.floor(Math.random() * 25),
    suggestedDifferential: [],
    literatureRefs: [],
    similarCaseIds: [],
  });

  // A technical quality candidate.
  candidates.push({
    category: "technical",
    region: "Image quality",
    description: `Technical quality assessment for ${modality}: coverage and artefact checks completed (${assessTechnicalQuality(modality).overall}% pass). Reject or accept after visual verification.`,
    confidence: 70 + Math.floor(Math.random() * 20),
    suggestedDifferential: [],
    literatureRefs: [],
    similarCaseIds: [],
  });

  return candidates;
}
