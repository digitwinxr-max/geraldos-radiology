import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware-helpers";
import { internalError } from "@/lib/api-error";
import { getAnalyticsSummary } from "@/services/analytics-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(request, "administration.read", async () => {
    try {
      const summary = await getAnalyticsSummary();
      return NextResponse.json(summary);
    } catch (error) {
      return internalError(error);
    }
  });
}
