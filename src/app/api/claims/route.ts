import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { insuranceClaims } from "@/db/schema";
import { withAuth } from "@/lib/middleware-helpers";
import { internalError } from "@/lib/api-error";
import { parseListQuery, listEnvelope, serviceOpts } from "@/lib/list-query";
import { listClaims } from "@/services/finance-service";
import { generateClaimNumber } from "@/lib/finance";
import { recordAudit } from "@/lib/audit";
import { integrationConfig } from "@/lib/integrations";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(request, "finance.read", async () => {
    const parsed = parseListQuery(request);
    if (!parsed.success) return parsed.error;

    try {
      const { rows, total } = await listClaims(serviceOpts(parsed.data));
      return NextResponse.json(listEnvelope(rows, total, parsed.data.page, parsed.data.pageSize));
    } catch {
      return internalError();
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, "finance.write", async () => {
    const body = await request.json().catch(() => null);
    if (!body?.invoiceId || !body?.patientId || !body?.medicalAid || !body?.amountClaimed) {
      return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: "invoiceId, patientId, medicalAid, and amountClaimed are required" } }, { status: 400 });
    }

    try {
      const [claim] = await db
        .insert(insuranceClaims)
        .values({
          claimNumber: generateClaimNumber(),
          invoiceId: body.invoiceId,
          patientId: body.patientId,
          medicalAid: body.medicalAid,
          membershipNumber: body.membershipNumber ?? null,
          amountClaimed: Number(body.amountClaimed).toFixed(2),
          status: "submitted",
          notes: body.notes ?? null,
        })
        .returning();

      await recordAudit({
        action: "claim.submitted",
        module: "finance",
        entityType: "insurance_claim",
        entityId: claim.id,
        details: { claimNumber: claim.claimNumber, medicalAid: body.medicalAid },
      });

      // Best-effort n8n automation trigger
      try {
        const base = integrationConfig.n8n.webhookBase || (integrationConfig.n8n.url ? `${integrationConfig.n8n.url}/webhook` : "");
        if (base) {
          await fetch(`${base}/insurance-claim-submitted`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ claimNumber: claim.claimNumber, medicalAid: body.medicalAid }),
            signal: AbortSignal.timeout(4000),
          });
        }
      } catch {
        /* best-effort automation trigger */
      }

      return NextResponse.json({ data: claim }, { status: 201 });
    } catch {
      return internalError();
    }
  });
}
