/**
 * Gate — WADO-URI proxy requires a valid session.
 *
 * WADO-URI serves DICOM pixel data, so the session cookie is verified
 * explicitly before any Orthanc traffic. A missing or invalid cookie gets a
 * 401 and the request never reaches Orthanc.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...actual, verifySessionToken: vi.fn() };
});
vi.mock("@/lib/integrations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations")>();
  return {
    ...actual,
    integrationConfig: {
      ...actual.integrationConfig,
      orthanc: { ...actual.integrationConfig.orthanc, url: "http://orthanc.test:8042" },
    },
    orthancAuthHeader: vi.fn().mockReturnValue({}),
  };
});

import { verifySessionToken } from "@/lib/auth/session";
import { GET } from "@/app/api/orthanc/wado-uri/route";

const session = { sub: "u1", name: "User", roles: ["radiologist"], iss: "test" };

function req(path: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/orthanc/wado-uri — session gate", () => {
  it("returns 401 without a session cookie and does not reach Orthanc", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    );

    const res = await GET(req("/api/orthanc/wado-uri?requestType=WADO&studyUID=1.2.3"));

    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("returns 401 when the session token is invalid", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(null);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    );

    const res = await GET(req("/api/orthanc/wado-uri?studyUID=1.2.3", "geraldos_session=forged"));

    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("forwards to Orthanc WADO and returns pixels with a valid session", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(session as never);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "application/dicom" },
      }),
    );

    const res = await GET(
      req('/api/orthanc/wado-uri?requestType=WADO&studyUID=1.2.3&seriesUID=4.5.6', "geraldos_session=valid"),
    );

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://orthanc.test:8042/wado?requestType=WADO&studyUID=1.2.3&seriesUID=4.5.6",
      expect.objectContaining({ method: "GET" }),
    );
    expect(res.headers.get("content-type")).toBe("application/dicom");

    fetchSpy.mockRestore();
  });
});