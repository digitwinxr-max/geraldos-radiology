import { NextRequest, NextResponse } from "next/server";
import { integrationConfig } from "@/lib/integrations";
import { generatePresignedUpload } from "@/lib/integrations/minio";
import { v4 as uuid } from "uuid";
import { withAuth } from "@/lib/middleware-helpers";
import { apiError, internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return withAuth(request, "integrations.write", async () => {
    const { endpoint } = integrationConfig.minio;
    if (!endpoint) {
      return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "MinIO is not configured (MINIO_ENDPOINT)" } }, { status: 503 });
    }
    const body = (await request.json()) as { filename?: string; contentType?: string; scope?: string };
    const scope = (body.scope ?? "documents").replace(/[^a-z0-9-]/gi, "");
    const filename = (body.filename ?? "file.bin").replace(/[^\w.-]/g, "_");
    const contentType = body.contentType ?? "application/octet-stream";
    const key = `${scope}/${new Date().toISOString().slice(0, 10)}/${uuid()}-${filename}`;

    try {
      const result = await generatePresignedUpload(key, contentType);
      return NextResponse.json(result);
    } catch {
      return internalError();
    }
  });
}
