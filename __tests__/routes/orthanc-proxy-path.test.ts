/**
 * Path sanitisation — GET /api/orthanc/proxy?p=…
 *
 * The route builds an upstream URL from a caller-supplied path. `fetch()`
 * normalises the URL it is given, so an un-rejected `..` segment would let an
 * authenticated caller walk out of the intended Orthanc namespace
 * (`p=studies/../../system` resolves to `/system`). These cases must be refused
 * before any request is made.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { orthancConfig } = vi.hoisted(() => ({
  orthancConfig: { url: "http://geraldos-orthanc-ab1c:8042", username: "orthanc", password: "s3cret" },
}));

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...actual, verifySessionToken: vi.fn() };
});
vi.mock("@/lib/integrations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations")>();
  return {
    ...actual,
    integrationConfig: { ...actual.integrationConfig, orthanc: orthancConfig },
    // Sentinel so the test can prove the server-side credential reaches the
    // upstream request without depending on real env values.
    orthancAuthHeader: vi.fn().mockReturnValue({ Authorization: "Basic c2VudGluZWw=" }),
  };
});

import { verifySessionToken } from "@/lib/auth/session";
import { GET } from "@/app/api/orthanc/proxy/route";

const admin = { sub: "admin-1", name: "Admin", roles: ["administrator"], iss: "geraldos-native" };

function req(p: string): NextRequest {
  return new NextRequest(`http://localhost/api/orthanc/proxy?p=${encodeURIComponent(p)}`, {
    headers: { cookie: "geraldos_session=valid" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifySessionToken).mockResolvedValue(admin as never);
});

describe("GET /api/orthanc/proxy — path sanitisation", () => {
  it.each([
    ["parent traversal", "studies/../../system"],
    ["bare traversal", ".."],
    ["encoded traversal", "studies/..%2f..%2fsystem"],
    ["backslash escape", "studies\\..\\system"],
    ["absolute path", "/system"],
    ["double slash", "studies//instances"],
    ["embedded query", "studies?expand"],
    ["empty path", ""],
  ])("refuses %s with 400 and never contacts Orthanc", async (_label, p) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    const res = await GET(req(p));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("forwards a legitimate resource path unchanged", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ID: "study-1" }), { status: 200, headers: { "content-type": "application/json" } }),
    );

    const res = await GET(req("studies/abc-123/series"));

    expect(res.status).toBe(200);
    const [target, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(target).toBe("http://geraldos-orthanc-ab1c:8042/studies/abc-123/series");
    // Orthanc credentials are attached server-side and never returned to the client.
    expect((init.headers as Record<string, string>).Authorization).toBe("Basic c2VudGluZWw=");
    // The credential is used server-side only; it never appears in the response.
    expect(await res.text()).not.toContain("Basic ");
    fetchSpy.mockRestore();
  });

  it("reports 503 NOT_CONFIGURED without exposing an internal address", async () => {
    orthancConfig.url = "";
    const res = await GET(req("studies"));
    const raw = await res.text();

    expect(res.status).toBe(503);
    expect(raw).toContain("NOT_CONFIGURED");
    expect(raw).not.toContain("geraldos-orthanc-ab1c");
    orthancConfig.url = "http://geraldos-orthanc-ab1c:8042";
  });
});
