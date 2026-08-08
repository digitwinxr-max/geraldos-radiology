import { NextResponse } from "next/server";
import { getCommandCentreSnapshot } from "@/lib/command-centre";

export const dynamic = "force-dynamic";

/** GET /api/command-centre — full real-time operational snapshot. */
export async function GET() {
  try {
    const snapshot = await getCommandCentreSnapshot();
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (error) {
    return NextResponse.json({ ok: false, error: "failed to build snapshot", detail: String(error) }, { status: 500 });
  }
}
