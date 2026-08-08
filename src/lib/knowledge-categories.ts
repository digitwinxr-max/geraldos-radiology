/**
 * Knowledge category constants — pure module safe to import in client components.
 * (Server-side helpers that touch the database live in `src/lib/knowledge.ts`.)
 */

export const KNOWLEDGE_CATEGORIES = [
  { key: "sop", label: "Clinical SOPs", icon: "clipboard" },
  { key: "protocol", label: "Radiology Protocols", icon: "scan" },
  { key: "manual", label: "Machine Manuals", icon: "server" },
  { key: "vendor", label: "Vendor Guides", icon: "building" },
  { key: "quality", label: "Quality Procedures", icon: "shield" },
  { key: "accreditation", label: "Accreditation Standards", icon: "award" },
  { key: "radiation", label: "Radiation Safety", icon: "alert" },
  { key: "policy", label: "Policies", icon: "book" },
  { key: "training", label: "Training Material", icon: "graduation" },
  { key: "template", label: "Reporting Templates", icon: "file" },
  { key: "preparation", label: "Preparation Guides", icon: "users" },
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number]["key"];

export const DOC_TYPES = ["sop", "guide", "protocol", "manual", "policy", "checklist", "template", "standard"] as const;
