import { NextResponse } from "next/server";
import { publicClientConfig } from "@/lib/integrations";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/client-config — public (non-secret) integration config
 * for the browser client. Exempt from auth as it contains only UI-toggle flags.
 */
export async function GET() {
  return NextResponse.json(publicClientConfig());
}
