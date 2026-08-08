import { describe, it, expect } from "vitest";

import {
  prepareDraft,
  scoreReport,
  isIncomplete,
  extractMeasurements,
  detectCriticalFindings,
  terminologyDrift,
  BUILT_IN_TEMPLATES,
  CRITICAL_FINDINGS_TERMS,
  TERMINOLOGY_MAP,
} from "@/lib/reporting";

describe("Reporting Assistant", () => {
  describe("BUILT_IN_TEMPLATES", () => {
    it("should have templates for all major modalities", () => {
      const modalities = BUILT_IN_TEMPLATES.map((t) => t.modality);
      expect(modalities).toContain("X-Ray");
      expect(modalities).toContain("CT");
      expect(modalities).toContain("MRI");
      expect(modalities).toContain("Ultrasound");
      expect(modalities).toContain("Mammography");
    });

    it("each template should have required fields", () => {
      for (const template of BUILT_IN_TEMPLATES) {
        expect(template.id).toBeTruthy();
        expect(template.name).toBeTruthy();
        expect(template.sections.length).toBeGreaterThan(0);
        expect(template.checklist.length).toBeGreaterThan(0);
      }
    });
  });

  describe("prepareDraft", () => {
    it("should return default template when none specified", () => {
      const result = prepareDraft({});
      expect(result.template).toBeTruthy();
      expect(result.suggestedSections.length).toBeGreaterThan(0);
      expect(result.reminder).toContain("decision support");
    });

    it("should match modality to template", () => {
      const result = prepareDraft({ modality: "CT" });
      expect(result.template.modality).toBe("CT");
    });

    it("should use specific template when ID provided", () => {
      const result = prepareDraft({ templateId: "mri-knee-standard" });
      expect(result.template.id).toBe("mri-knee-standard");
    });

    it("should provide body part hints for known procedures", () => {
      const result = prepareDraft({ procedure: "CT Brain" });
      expect(result.bodyPartHints.some((h) => h.includes("brain"))).toBe(true);
    });
  });

  describe("scoreReport", () => {
    it("should give low score for empty report", () => {
      const result = scoreReport({});
      expect(result.score).toBeLessThan(50);
      expect(result.checks.length).toBeGreaterThan(0);
    });

    it("should give higher score for complete report", () => {
      const result = scoreReport({
        findings: "The chest radiograph demonstrates clear lung fields bilaterally. No focal consolidation, pleural effusion, or pneumothorax identified. Heart size is normal. Mediastinal contours are unremarkable.",
        impression: "Normal chest radiograph. No acute cardiopulmonary abnormality.",
        recommendation: "No further imaging recommended at this time.",
      });
      expect(result.score).toBeGreaterThanOrEqual(70);
    });

    it("should flag placeholder text", () => {
      const result = scoreReport({
        findings: "[TBD] findings here",
        impression: "Normal",
      });
      const placeholderCheck = result.checks.find((c) => c.label.includes("placeholder"));
      expect(placeholderCheck?.passed).toBe(false);
    });

    it("should flag inconsistent terminology", () => {
      const result = scoreReport({
        findings: "There is edema in the soft tissues",
        impression: "Soft tissue edema",
      });
      const termCheck = result.checks.find((c) => c.label.includes("Terminology"));
      expect(termCheck?.passed).toBe(false);
    });
  });

  describe("extractMeasurements", () => {
    it("should extract mm measurements", () => {
      const measurements = extractMeasurements("Lesion measures 12 mm in diameter");
      expect(measurements).toContain("12 mm");
    });

    it("should extract cm measurements", () => {
      const measurements = extractMeasurements("Mass 3.4 cm x 2.1 cm");
      expect(measurements.some((m) => m.includes("cm"))).toBe(true);
    });

    it("should deduplicate measurements", () => {
      const measurements = extractMeasurements("12 mm and 12 mm");
      const twelveMm = measurements.filter((m) => m.includes("12"));
      expect(twelveMm.length).toBe(1);
    });

    it("should return empty for no measurements", () => {
      const measurements = extractMeasurements("No measurements noted");
      expect(measurements.length).toBe(0);
    });
  });

  describe("detectCriticalFindings", () => {
    it("should detect pneumothorax", () => {
      const findings = detectCriticalFindings("Left pneumothorax noted");
      expect(findings).toContain("pneumothorax");
    });

    it("should detect intracranial haemorrhage", () => {
      const findings = detectCriticalFindings("Acute intracranial haemorrhage");
      expect(findings).toContain("intracranial haemorrhage");
    });

    it("should detect multiple critical findings", () => {
      const findings = detectCriticalFindings("Pulmonary embolism with massive effusion");
      expect(findings.length).toBeGreaterThanOrEqual(2);
    });

    it("should return empty for normal report", () => {
      const findings = detectCriticalFindings("Normal study");
      expect(findings.length).toBe(0);
    });
  });

  describe("terminologyDrift", () => {
    it("should flag US English terms", () => {
      const drift = terminologyDrift("There is edema and a tumor");
      expect(drift.some((d) => d.term === "edema")).toBe(true);
      expect(drift.some((d) => d.term === "tumor")).toBe(true);
    });

    it("should not flag British English terms", () => {
      const drift = terminologyDrift("There is oedema and a tumour");
      expect(drift.length).toBe(0);
    });

    it("should suggest correct British terms", () => {
      const drift = terminologyDrift("edema");
      expect(drift[0]?.suggested).toBe("oedema");
    });
  });

  describe("CRITICAL_FINDINGS_TERMS", () => {
    it("should include key critical findings", () => {
      expect(CRITICAL_FINDINGS_TERMS).toContain("pneumothorax");
      expect(CRITICAL_FINDINGS_TERMS).toContain("aortic dissection");
      expect(CRITICAL_FINDINGS_TERMS).toContain("pulmonary embolism");
      expect(CRITICAL_FINDINGS_TERMS).toContain("intracranial haemorrhage");
    });
  });
});
