import { NextRequest, NextResponse } from "next/server";
import { getCommandCentreSnapshot } from "@/lib/command-centre";
import { withAuth } from "@/lib/middleware-helpers";
import { internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

/** GET /api/command-centre — full real-time operational snapshot. */
export async function GET(request: NextRequest) {
  return withAuth(request, "workflow.read", async () => {
    try {
      const snapshot = await getCommandCentreSnapshot();
      return NextResponse.json({ ok: true, ...snapshot });
    } catch {
      return internalError();
    }
  });
}
