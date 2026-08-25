import { NextRequest, NextResponse } from "next/server";
import { integrationConfig } from "@/lib/integrations";
import { listBuckets, ensureBucket } from "@/lib/integrations/minio";
import { withAuth } from "@/lib/middleware-helpers";
import { internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(request, "integrations.read", async () => {
    const { endpoint, bucket } = integrationConfig.minio;
    if (!endpoint) {
      return NextResponse.json({ ok: false, reason: "not_configured", buckets: [] });
    }
    try {
      await ensureBucket();
      const buckets = await listBuckets();
      return NextResponse.json({ ok: true, buckets, defaultBucket: bucket });
    } catch {
      return internalError();
    }
  });
}
