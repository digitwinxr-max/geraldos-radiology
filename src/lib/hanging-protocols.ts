/**
 * GeraldOS Hanging Protocols (Phase 7).
 *
 * A hanging protocol automatically configures the viewer layout for a given
 * modality/exam: grid rows×cols, which study each viewport shows (current vs
 * prior), the window/level preset and the display label. Users may create
 * custom protocols; they are stored in localStorage and merged over the
 * built-ins at runtime (see buildProtocols).
 */

export type ViewportRole = "current" | "prior";

export interface HangingViewport {
  row: number;
  col: number;
  role: ViewportRole;
  label: string;
  windowPreset?: string; // e.g. "Lung", "Mediastinum", "Bone", "Brain", "Soft Tissue"
  seriesMatch?: string; // free-text series description matcher (lowercase substring)
  synchronized?: boolean;
}

export interface HangingProtocol {
  id: string;
  name: string;
  modality: string;
  description: string;
  rows: number;
  cols: number;
  viewports: HangingViewport[];
  isSystem?: boolean;
}

export const WINDOW_PRESETS = [
  "Lung",
  "Mediastinum",
  "Bone",
  "Brain",
  "Soft Tissue",
  "Abdomen",
  "Pelvis",
  "Angio",
  "Auto",
] as const;

/** Built-in protocols (system — never edited in place). */
export const BUILT_IN_PROTOCOLS: HangingProtocol[] = [
  {
    id: "ct-chest-2x2",
    name: "CT Chest — 2×2 (Lung / Mediastinum + Prior)",
    modality: "CT",
    description: "Axial lung + mediastinum windows on the current study with prior CT comparison.",
    rows: 2,
    cols: 2,
    viewports: [
      { row: 0, col: 0, role: "current", label: "Current · Axial · Lung", windowPreset: "Lung", seriesMatch: "axial", synchronized: true },
      { row: 0, col: 1, role: "current", label: "Current · Axial · Mediastinum", windowPreset: "Mediastinum", seriesMatch: "axial", synchronized: true },
      { row: 1, col: 0, role: "prior", label: "Prior · Axial · Lung", windowPreset: "Lung", seriesMatch: "axial", synchronized: true },
      { row: 1, col: 1, role: "prior", label: "Prior · Axial · Mediastinum", windowPreset: "Mediastinum", seriesMatch: "axial", synchronized: true },
    ],
    isSystem: true,
  },
  {
    id: "ct-chest-1x2",
    name: "CT Chest — 1×2 (Current / Prior)",
    modality: "CT",
    description: "Single viewport per study for quick prior comparison.",
    rows: 1,
    cols: 2,
    viewports: [
      { row: 0, col: 0, role: "current", label: "Current", windowPreset: "Lung", seriesMatch: "axial", synchronized: true },
      { row: 0, col: 1, role: "prior", label: "Prior", windowPreset: "Lung", seriesMatch: "axial", synchronized: true },
    ],
    isSystem: true,
  },
  {
    id: "ct-brain-1x1",
    name: "CT Brain — Single Viewport",
    modality: "CT",
    description: "Dedicated brain window for the current study.",
    rows: 1,
    cols: 1,
    viewports: [{ row: 0, col: 0, role: "current", label: "Current · Brain", windowPreset: "Brain", seriesMatch: "brain" }],
    isSystem: true,
  },
  {
    id: "mammo-2x2",
    name: "Mammography — 2×2 (Current / Prior per side)",
    modality: "Mammography",
    description: "Left and right current with previous comparison (craniocaudal view).",
    rows: 2,
    cols: 2,
    viewports: [
      { row: 0, col: 0, role: "current", label: "Left · CC · Current", seriesMatch: "left" },
      { row: 0, col: 1, role: "prior", label: "Left · CC · Prior", seriesMatch: "left" },
      { row: 1, col: 0, role: "current", label: "Right · CC · Current", seriesMatch: "right" },
      { row: 1, col: 1, role: "prior", label: "Right · CC · Prior", seriesMatch: "right" },
    ],
    isSystem: true,
  },
  {
    id: "mammo-1x2",
    name: "Mammography — 1×2 (Current / Prior)",
    modality: "Mammography",
    description: "Single side current vs previous.",
    rows: 1,
    cols: 2,
    viewports: [
      { row: 0, col: 0, role: "current", label: "Current", seriesMatch: "left" },
      { row: 0, col: 1, role: "prior", label: "Prior", seriesMatch: "left" },
    ],
    isSystem: true,
  },
  {
    id: "us-standard",
    name: "Ultrasound — Standard + Measurements",
    modality: "Ultrasound",
    description: "Standard single viewport with measurement panel alongside.",
    rows: 1,
    cols: 1,
    viewports: [{ row: 0, col: 0, role: "current", label: "Standard", windowPreset: "Auto" }],
    isSystem: true,
  },
  {
    id: "xr-chest-1x1",
    name: "Chest X-Ray — Single Viewport",
    modality: "X-Ray",
    description: "Standard chest radiograph viewport.",
    rows: 1,
    cols: 1,
    viewports: [{ row: 0, col: 0, role: "current", label: "Chest", windowPreset: "Auto" }],
    isSystem: true,
  },
  {
    id: "xr-1x2",
    name: "X-Ray — Current / Prior",
    modality: "X-Ray",
    description: "Comparison of current radiograph against the previous examination.",
    rows: 1,
    cols: 2,
    viewports: [
      { row: 0, col: 0, role: "current", label: "Current", windowPreset: "Auto" },
      { row: 0, col: 1, role: "prior", label: "Prior", windowPreset: "Auto" },
    ],
    isSystem: true,
  },
];

const CUSTOM_PROTOCOLS_KEY = "geraldos-custom-protocols";

/** Load custom protocols from localStorage (client-only helper). */
export function loadCustomProtocols(): HangingProtocol[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_PROTOCOLS_KEY);
    return raw ? (JSON.parse(raw) as HangingProtocol[]) : [];
  } catch {
    return [];
  }
}

export function saveCustomProtocol(protocol: HangingProtocol): void {
  if (typeof window === "undefined") return;
  const existing = loadCustomProtocols().filter((p) => p.id !== protocol.id);
  existing.push(protocol);
  window.localStorage.setItem(CUSTOM_PROTOCOLS_KEY, JSON.stringify(existing));
}

export function deleteCustomProtocol(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    CUSTOM_PROTOCOLS_KEY,
    JSON.stringify(loadCustomProtocols().filter((p) => p.id !== id))
  );
}

/** Full protocol list for a modality: custom protocols first, then built-ins. */
export function buildProtocols(modality?: string): HangingProtocol[] {
  const customs = loadCustomProtocols();
  const pool = [...customs, ...BUILT_IN_PROTOCOLS];
  if (!modality) return pool;
  const matched = pool.filter((p) => p.modality.toLowerCase() === modality.toLowerCase());
  const generic = pool.filter((p) => p.id === "xr-chest-1x1" || p.id === "us-standard");
  return matched.length > 0 ? matched : generic;
}

/**
 * Default protocol for a modality + procedure hints (Phase 7 hanging protocols).
 * Prefers a custom protocol, then a built-in matching the procedure keywords
 * (brain, chest, mammo, knee, abdomen…), then the first protocol for the modality.
 */
export function defaultProtocolFor(modality?: string, hints?: string): HangingProtocol | null {
  const list = buildProtocols(modality);
  if (list.length === 0) return null;
  const custom = list.find((p) => !p.isSystem);
  if (custom) return custom;
  const h = (hints ?? "").toLowerCase();
  if (h) {
    const ranked = list
      .map((p) => {
        const hay = `${p.name} ${p.description}`.toLowerCase();
        let score = 0;
        for (const tok of h.split(/[\s/-]+/).filter((t) => t.length > 2)) {
          if (hay.includes(tok)) score += 1;
        }
        return { p, score };
      })
      .sort((a, b) => b.score - a.score);
    if (ranked[0].score > 0) return ranked[0].p;
  }
  return list[0];
}

/** Grid cells (row, col) ordered for rendering a rows×cols layout. */
export function gridCells(rows: number, cols: number): { row: number; col: number }[] {
  const cells: { row: number; col: number }[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({ row: r, col: c });
  return cells;
}

/** Create a fresh custom protocol from user input. */
export function createCustomProtocol(input: {
  name: string;
  modality: string;
  rows: number;
  cols: number;
}): HangingProtocol {
  const id = `custom-${Date.now()}`;
  const viewports = gridCells(input.rows, input.cols).map(({ row, col }) => ({
    row,
    col,
    role: "current" as ViewportRole,
    label: `${input.name} · ${String.fromCharCode(65 + col)}${row + 1}`,
    windowPreset: "Auto",
  }));
  return {
    id,
    name: input.name,
    modality: input.modality,
    description: "Custom hanging protocol",
    rows: input.rows,
    cols: input.cols,
    viewports,
  };
}
