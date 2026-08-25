import { NextRequest, NextResponse } from "next/server";
import {
  prepareDraft,
  scoreReport,
  isIncomplete,
  extractMeasurements,
  detectCriticalFindings,
  terminologyDrift,
  BUILT_IN_TEMPLATES,
} from "@/lib/reporting";
import { db } from "@/db";
import { reportTemplates, workflowStudies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recordAudit } from "@/lib/audit";
import { withAuth } from "@/lib/middleware-helpers";
import { apiError, internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

/**
 * POST /api/reports/assist
 *
 * Decision-support payload for the radiologist. Body:
 * { templateId?, modality?, procedure?, clinicalIndication?,
 *   studyId?, reportId?, findings?, impression?, recommendation? }
 *
 * Returns: recommended template, structured shell, checklist, quality score,
 * incomplete sections, critical-finding terms, terminology drift and extracted
 * measurements. Nothing here writes to the report — the radiologist confirms.
 */
export async function POST(request: NextRequest) {
  return withAuth(request, "reports.write", async () => {
    const body = await request.json().catch(() => null);
    if (!body) return apiError("VALIDATION_FAILED", "Request body is required", 400);

    try {
      // Resolve study → procedure/indication context.
      let procedure = body.procedure as string | undefined;
      let modality = body.modality as string | undefined;
      const clinicalIndication = body.clinicalIndication as string | undefined;
      if (body.studyId) {
        const [study] = await db.select().from(workflowStudies).where(eq(workflowStudies.id, body.studyId));
        if (study) {
          procedure = study.procedure;
          modality = study.modality;
        }
      }

      // Resolve template: explicit id → modality match → default.
      const customTemplates = (await db.select().from(reportTemplates).where(eq(reportTemplates.active, true))).map((t) => ({
        id: t.id,
        name: t.name,
        modality: t.modality,
        description: t.description ?? "",
        sections: (t.sections as { name: string; hint?: string }[]) ?? [],
        checklist: (t.checklist as string[]) ?? [],
        isSystem: t.isSystem,
      }));
      let template =
        BUILT_IN_TEMPLATES.find((t) => t.id === body.templateId) ??
        customTemplates.find((t) => t.id === body.templateId) ??
        null;
      if (!template && modality) {
        template = BUILT_IN_TEMPLATES.find((t) => t.modality === modality) ?? null;
        if (!template) template = customTemplates.find((t) => t.modality === modality) ?? null;
      }

      const draft = prepareDraft({ templateId: template?.id, modality, procedure, clinicalIndication });

      // Quality assessment over the current draft text (if any).
      const findings = body.findings as string | undefined;
      const impression = body.impression as string | undefined;
      const recommendation = body.recommendation as string | undefined;
      const quality = scoreReport({ findings, impression, recommendation, template: template ? { ...template, sections: draft.suggestedSections, checklist: draft.checklist } : null });
      const incomplete = isIncomplete({ findings, impression, recommendation, template: template ? { ...template, sections: draft.suggestedSections, checklist: draft.checklist } : null });

      const combinedText = `${findings ?? ""} ${impression ?? ""} ${recommendation ?? ""}`;
      const critical = detectCriticalFindings(combinedText);
      const drift = terminologyDrift(combinedText);
      const measurements = extractMeasurements(`${findings ?? ""} ${impression ?? ""}`);

      // Prior study comparison support.
      let priorStudies: { id: string; procedure: string; modality: string; createdAt: Date }[] = [];
      if (body.patientId) {
        const rows = await db
          .select({
            id: workflowStudies.id,
            procedure: workflowStudies.procedure,
            modality: workflowStudies.modality,
            createdAt: workflowStudies.createdAt,
          })
          .from(workflowStudies)
          .where(eq(workflowStudies.patientId, body.patientId));
        priorStudies = rows.filter((r) => r.id !== body.studyId).slice(0, 5);
      }

      await recordAudit({
        action: "report.ai_assist",
        module: "reporting",
        entityType: "report",
        entityId: body.reportId ?? body.studyId ?? null,
        details: { templateId: template?.id, qualityScore: quality.score },
      });

      return NextResponse.json({
        ok: true,
        template: template ? { ...template, sections: draft.suggestedSections, checklist: draft.checklist } : null,
        suggestedSections: draft.suggestedSections,
        checklist: draft.checklist,
        bodyPartHints: draft.bodyPartHints,
        reminder: draft.reminder,
        quality,
        incomplete,
        criticalFindings: critical,
        terminologyDrift: drift,
        measurements,
        priorStudies,
        sources: [template?.name ?? "default template"].filter(Boolean),
      });
    } catch (error) {
      return internalError(error);
    }
  });
}
