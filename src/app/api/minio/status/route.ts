import { NextResponse } from "next/server";
import { integrationConfig } from "@/lib/integrations";
import { listBuckets, ensureBucket } from "@/lib/integrations/minio";

export const dynamic = "force-dynamic";

export async function GET() {
  const { endpoint, bucket } = integrationConfig.minio;
  if (!endpoint) {
    return NextResponse.json({ ok: false, reason: "not_configured", buckets: [] });
  }
  try {
    await ensureBucket();
    const buckets = await listBuckets();
    return NextResponse.json({ ok: true, buckets, defaultBucket: bucket });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      reason: error instanceof Error ? error.message : "unreachable",
      buckets: [],
    });
  }
}
