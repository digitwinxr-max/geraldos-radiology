import { NextRequest, NextResponse } from "next/server";
import { listReferrals, createReferral } from "@/services/referrals-service";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, createReferralSchema } from "@/lib/validation";
import { internalError } from "@/lib/api-error";
import { parseListQuery, listEnvelope, serviceOpts } from "@/lib/list-query";

export const dynamic = "force-dynamic";

/** GET /api/referrals?patientId=<uuid>&page=1&pageSize=50 — referral intake list. */
export async function GET(request: NextRequest) {
  return withAuth(request, "referrals.read", async () => {
    const parsed = parseListQuery(request, { sorts: ["createdAt"] });
    if (!parsed.success) return parsed.error;
    const patientId = request.nextUrl.searchParams.get("patientId") ?? undefined;

    try {
      const { rows, total } = await listReferrals(serviceOpts(parsed.data), patientId);
      return NextResponse.json(listEnvelope(rows, total, parsed.data.page, parsed.data.pageSize));
    } catch (error) {
      return internalError(error);
    }
  });
}

/**
 * POST /api/referrals — register a referring-physician referral.
 * The smallest viable referral intake: a referral is recorded against a
 * patient; the workflow study is then created at stage `referral` (or an
 * appointment links it via referralId). Audited + emitted as
 * `referral.received`.
 */
export async function POST(request: NextRequest) {
  return withAuth(request, "referrals.write", async () => {
    const parsed = await validateBody(request, createReferralSchema);
    if (!parsed.success) return parsed.error;

    try {
      const referral = await createReferral({
        patientId: parsed.data.patientId,
        referringPhysician: parsed.data.referringPhysician,
        referringFacility: parsed.data.referringFacility ?? null,
        clinicalIndication: parsed.data.clinicalIndication,
        requestedProcedure: parsed.data.requestedProcedure,
        priority: parsed.data.priority,
        notes: parsed.data.notes ?? null,
      });
      return NextResponse.json({ ok: true, referral }, { status: 201 });
    } catch (error) {
      return internalError(error);
    }
  });
}
