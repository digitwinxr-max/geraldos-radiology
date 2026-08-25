import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { insuranceClaims, invoices, patients } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { withAuth } from "@/lib/middleware-helpers";
import { internalError } from "@/lib/api-error";
import { generateClaimNumber } from "@/lib/finance";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(request, "finance.read", async () => {
    try {
      const result = await db
        .select({
          id: insuranceClaims.id,
          claimNumber: insuranceClaims.claimNumber,
          medicalAid: insuranceClaims.medicalAid,
          membershipNumber: insuranceClaims.membershipNumber,
          amountClaimed: insuranceClaims.amountClaimed,
          amountApproved: insuranceClaims.amountApproved,
          status: insuranceClaims.status,
          submittedAt: insuranceClaims.submittedAt,
          respondedAt: insuranceClaims.respondedAt,
          rejectionReason: insuranceClaims.rejectionReason,
          invoiceNumber: invoices.invoiceNumber,
          patientFirstName: patients.firstName,
          patientLastName: patients.lastName,
          patientMrn: patients.mrn,
        })
        .from(insuranceClaims)
        .leftJoin(invoices, eq(insuranceClaims.invoiceId, invoices.id))
        .leftJoin(patients, eq(insuranceClaims.patientId, patients.id))
        .orderBy(desc(insuranceClaims.submittedAt));

      return NextResponse.json({ data: result });
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
        const base = process.env.N8N_WEBHOOK_BASE || (process.env.N8N_URL ? `${process.env.N8N_URL}/webhook` : "");
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
