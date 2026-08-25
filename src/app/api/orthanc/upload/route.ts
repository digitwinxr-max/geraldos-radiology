import { NextRequest, NextResponse } from "next/server";
import { integrationConfig, orthancAuthHeader, timedFetch } from "@/lib/integrations";
import { recordAudit } from "@/lib/audit";
import { publishEvent } from "@/lib/events";
import { withAuth } from "@/lib/middleware-helpers";
import { apiError, internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

/**
 * POST /api/orthanc/upload
 *
 * Accepts `multipart/form-data` with one or more `.dcm` files under the field
 * name `files`, and forwards each to Orthanc's DICOMweb STOW-RS / DICOM endpoint
 * (`POST /instances` with content-type application/dicom). PACS credentials stay
 * server-side. Returns the Orthanc IDs of the stored instances.
 */
export async function POST(request: NextRequest) {
  return withAuth(request, "integrations.write", async () => {
    const { url } = integrationConfig.orthanc;
    if (!url) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return apiError("VALIDATION_FAILED", "Invalid multipart body", 400);
    }

    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return apiError("VALIDATION_FAILED", "No DICOM files provided (field: files)", 400);
    }

    const results: { filename: string; orthancId?: string; error?: string }[] = [];
    const base = url.replace(/\/$/, "");
    const headers: HeadersInit = { ...orthancAuthHeader() };

    try {
      for (const file of files) {
        if (!file.name.toLowerCase().endsWith(".dcm") && file.type !== "application/dicom") {
          results.push({ filename: file.name, error: "not a DICOM file" });
          continue;
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        try {
          const res = await timedFetch(
            `${base}/instances`,
            { method: "POST", headers: { ...headers, "content-type": "application/dicom" }, body: new Uint8Array(buffer) },
            20000
          );
          if (!res.ok) {
            results.push({ filename: file.name, error: `upstream_http_${res.status}` });
            continue;
          }
          const json = (await res.json()) as { ID?: string };
          results.push({ filename: file.name, orthancId: json.ID });
        } catch (error) {
          results.push({ filename: file.name, error: error instanceof Error ? error.message : "upload failed" });
        }
      }

      const success = results.filter((r) => r.orthancId).length;
      await recordAudit({
        action: "study.uploaded",
        module: "orthanc",
        entityType: "dicom",
        details: { files: files.map((f) => f.name), success, failed: results.length - success },
      });
      await publishEvent({
        type: "study.uploaded",
        aggregate: "orthanc",
        payload: { success, failed: results.length - success },
      });

      return NextResponse.json({
        ok: success > 0,
        success,
        failed: results.length - success,
        results,
      });
    } catch (error) {
      return internalError(error);
    }
  });
}
