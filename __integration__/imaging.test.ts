/**
 * Integration gate â€” Orthanc imaging path and study reconciliation through the
 * real PACS. Exercises: authenticated upload â†’ DICOMweb gate â†’ worklist
 * reconciliation â†’ workflow state machine.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { jarFetch, nativeLogin, provisionStaff, createCookieJar, type CookieJar } from "./helpers/http";
import { env, USERS } from "./helpers/env";

let admin!: CookieJar;
let radiologist!: CookieJar;
let receptionist!: CookieJar;
// Shared across describes: upload → aggregation → reconciliation.
let uploadedInstanceId = "";
let studyInstanceUid = "";
let viewerHtml = "";

/** Resolve the authoritative StudyInstanceUID for an Orthanc instance id.
 *  Instance-level MainDicomTags carry only SOPInstanceUID — the study tag
 *  lives on the parent study resource. */
async function studyUidForInstance(instanceId: string): Promise<string> {
  const res = await fetch(`${env.orthancUrl}/instances/${instanceId}/study`, {
    headers: { authorization: orthancAuth() },
  });
  const study = (await res.json()) as { MainDicomTags?: { StudyInstanceUID?: string } };
  return study.MainDicomTags?.StudyInstanceUID ?? "";
}

beforeAll(async () => {
  await provisionStaff();
  admin = await nativeLogin(USERS.admin.email, USERS.admin.password);
  radiologist = await nativeLogin(USERS.radiologist.email, USERS.radiologist.password);
  receptionist = await nativeLogin(USERS.receptionist.email, USERS.receptionist.password);
});

function orthancAuth(): string {
  return `Basic ${Buffer.from(`${env.orthancUsername}:${env.orthancPassword}`).toString("base64")}`;
}

describe("Imaging â€” Orthanc â†’ GeraldOS", () => {
  it("uploads a real DICOM file through the authenticated app proxy into Orthanc", async () => {
    const dcmPath = path.resolve(process.cwd(), "dicom-samples", "MRI001_001.dcm");
    const bytes = readFileSync(dcmPath);

    const form = new FormData();
    form.append("files", new File([new Uint8Array(bytes)], "MRI001_001.dcm", { type: "application/dicom" }));

    const res = await jarFetch(admin, `${env.appUrl}/api/orthanc/upload`, { method: "POST", body: form });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.success).toBe(1);
    uploadedInstanceId = body.results[0].orthancId;
    expect(uploadedInstanceId).toBeTruthy();
  });

  it("rejects anonymous DICOMweb access with 401 before touching Orthanc", async () => {
    const res = await fetch(`${env.appUrl}/api/orthanc/dicom-web/studies`);
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("serves the same-origin DICOMweb endpoint for an authenticated session", async () => {
    const res = await jarFetch(radiologist, `${env.appUrl}/api/orthanc/dicom-web/studies?limit=10`);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    const studies = (await res.json()) as unknown[];
    expect(Array.isArray(studies)).toBe(true);
  });

  it("lists the uploaded study through the studies aggregation endpoint", async () => {
    // Derive the StudyInstanceUID straight from the authoritative PACS.
    studyInstanceUid = await studyUidForInstance(uploadedInstanceId);
    expect(studyInstanceUid).toBeTruthy();

    const res = await jarFetch(radiologist, `${env.appUrl}/api/orthanc/studies`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const match = (body.studies as { studyInstanceUid: string | null }[]).find(
      (s) => s.studyInstanceUid === studyInstanceUid,
    );
    expect(match, `study ${studyInstanceUid} should appear in /api/orthanc/studies`).toBeDefined();
  });
});

describe("Reconciliation â€” RIS study â†’ Orthanc study â†’ workflow state machine", () => {
  it("walks a patient from registration to sent_to_orthanc atomically", async () => {
// 1. Register the patient (reception).
    const patientRes = await jarFetch(receptionist, `${env.appUrl}/api/patients`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mrn: `MRN${Date.now()}`,
        firstName: "Kabo", lastName: "Integration", dateOfBirth: "1991-05-12", gender: "male",
      }),
    });
    expect(patientRes.status).toBe(201);
    const pb = await patientRes.json();
    const patient = pb.data ?? pb.patient ?? pb;

    // 2. Create the RIS study at referral (radiologist).
    const studyRes = await jarFetch(radiologist, `${env.appUrl}/api/workflow`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patientId: patient.id, modality: "MRI", procedure: "MRI Brain", priority: "urgent" }),
    });
    expect(studyRes.status).toBe(201);
    const study = (await studyRes.json()).study;

    // 3. Forward transitions respect the guards.
    const blocked = await jarFetch(radiologist, `${env.appUrl}/api/workflow/${study.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: "sent_to_orthanc" }), // no UID yet â€” must be refused
    });
    expect(blocked.status).toBe(400);

    // 4. Reconcile with the real Orthanc StudyInstanceUID.
    const instRes = await fetch(`${env.orthancUrl}/instances`, { headers: { authorization: orthancAuth() } });
    const firstInstance = ((await instRes.json()) as string[])[0];
    const uid = await studyUidForInstance(firstInstance);

    const ok = await jarFetch(radiologist, `${env.appUrl}/api/workflow/${study.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: "sent_to_orthanc", studyInstanceUid: uid }),
    });
    expect(ok.status).toBe(200);

    // 5. The committed state is visible on the workflow list.
    const list = await jarFetch(radiologist, `${env.appUrl}/api/workflow`);
    const rows = (await list.json()).data as { id: string; stage: string; studyInstanceUid: string | null }[];
    const persisted = rows.find((r) => r.id === study.id);
    expect(persisted?.stage).toBe("sent_to_orthanc");
    expect(persisted?.studyInstanceUid).toBe(uid);

    // 6. Backward moves are rejected.
    const backward = await jarFetch(radiologist, `${env.appUrl}/api/workflow/${study.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: "referral" }),
    });
    expect(backward.status).toBe(409);
  });
});

/**
 * Same-origin viewer mount — the path a radiologist actually takes:
 * login → open study → OHIF loads the study through GeraldOS → private Orthanc.
 *
 * The browser must reach OHIF through THIS origin (/viewer). A viewer on its
 * own hostname is cross-SITE with the app on Render (`onrender.com` is a public
 * suffix), so the SameSite=Lax session cookie that authorises DICOMweb would
 * never be sent.
 *
 * These assertions run against the real `ohif/app` image, which is the one thing
 * a mocked environment cannot reproduce: the HTML that image serves dictates
 * exactly which root-level paths the app has to proxy. Rather than hardcode
 * that list, every asset the shell references is fetched twice — once through
 * the app, once straight from the upstream container — and the two responses
 * must agree. A missing rewrite shows up as a mismatch immediately.
 */
describe("Viewer mount — same-origin OHIF through GeraldOS", () => {
  it("publishes the viewer as a path prefix and no internal address", async () => {
    const res = await fetch(`${env.appUrl}/api/integrations/client-config`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ohifUrl).toBe("/viewer");
    expect(body.orthancProxyBase).toBe("/api/orthanc/proxy");
    // No Orthanc/OHIF hostname, port or credential may reach the browser.
    expect(JSON.stringify(body)).not.toMatch(/https?:\/\//);
    expect("orthancUrl" in body).toBe(false);
  });

  it("refuses the viewer shell to an anonymous visitor", async () => {
    const res = await fetch(`${env.appUrl}/viewer`, { redirect: "manual" });
    expect([307, 401]).toContain(res.status);
  });

  it("serves the OHIF shell at /viewer, frameable by this origin only", async () => {
    const res = await jarFetch(radiologist, `${env.appUrl}/viewer`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    // The app-wide DENY / frame-ancestors 'none' must not apply here, or the
    // browser refuses to render the iframe on /imaging and /workstation.
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain("frame-ancestors 'none'");

    viewerHtml = await res.text();
    expect(viewerHtml).toMatch(/<script/i);
  });

  it("proxies the shell byte-for-byte from the upstream document root", async () => {
    const direct = await fetch(`${env.ohifUrl}/`);
    expect(direct.status).toBe(200);
    expect(await direct.text()).toBe(viewerHtml);
  });

  it("resolves every root-level asset the real OHIF bundle requests", async () => {
    expect(viewerHtml, "viewer shell must have been fetched first").toBeTruthy();

    const refs = [
      ...viewerHtml.matchAll(/(?:src|href)\s*=\s*["'](\/[^"']+)["']/g),
    ]
      .map((m) => m[1])
      .filter((u) => !u.startsWith("//"));
    expect(refs.length, "the OHIF shell must reference root-absolute assets").toBeGreaterThan(0);

    const mismatches: string[] = [];
    for (const ref of refs) {
      const viaApp = await jarFetch(radiologist, `${env.appUrl}${ref}`);
      const direct = await fetch(`${env.ohifUrl}${ref}`);
      const appType = viaApp.headers.get("content-type") ?? "";
      const directType = direct.headers.get("content-type") ?? "";
      if (viaApp.status !== direct.status || appType !== directType) {
        mismatches.push(`${ref}: app=${viaApp.status} ${appType} vs ohif=${direct.status} ${directType}`);
      }
    }
    expect(mismatches, `viewer assets not faithfully proxied: ${mismatches.join(" | ")}`).toEqual([]);
  });

  it("serves the mounted app-config with routerBasename /viewer and same-origin DICOMweb", async () => {
    const res = await jarFetch(radiologist, `${env.appUrl}/app-config.js`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("routerBasename: '/viewer'");
    expect(body).toContain("/api/orthanc/dicom-web");
    expect(body).toContain("window.location.origin");
  });

  it("maps a study deep link onto OHIF's own viewer route", async () => {
    expect(studyInstanceUid, "a study must have been uploaded first").toBeTruthy();
    const viaApp = await jarFetch(
      radiologist,
      `${env.appUrl}/viewer/viewer?StudyInstanceUIDs=${encodeURIComponent(studyInstanceUid)}`,
    );
    expect(viaApp.status).toBe(200);
    expect(viaApp.headers.get("content-type")).toContain("text/html");

    const direct = await fetch(`${env.ohifUrl}/viewer?StudyInstanceUIDs=${encodeURIComponent(studyInstanceUid)}`);
    expect(direct.status).toBe(200);
    expect(await direct.text()).toBe(await viaApp.text());
  });

  it("serves the study the viewer will load through the authenticated DICOMweb proxy", async () => {
    const res = await jarFetch(
      radiologist,
      `${env.appUrl}/api/orthanc/dicom-web/studies?StudyInstanceUID=${encodeURIComponent(studyInstanceUid)}`,
    );
    expect(res.status).toBe(200);
    const studies = (await res.json()) as unknown[];
    expect(Array.isArray(studies)).toBe(true);
  });
});
