/**
 * Gate — DICOMweb proxy is public (no session check).
 *
 * The DICOMweb route is exempt from authentication so that the OHIF viewer
 * iframe (which runs cross-port and cannot carry session cookies) can access
 * DICOMweb endpoints. The proxy.ts handles auth for the main app.
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
    integrationConfig: { ...actual.integrationConfig, orthanc: { ...actual.integrationConfig.orthanc, url: "http://orthanc.test:8042" } },
    orthancAuthHeader: vi.fn().mockReturnValue({}),
  };
});

import { verifySessionToken } from "@/lib/auth/session";
import { GET } from "@/app/api/orthanc/dicom-web/[...path]/route";

const session = { sub: "u1", name: "User", roles: ["radiologist"], iss: "test" };

function req(path: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/orthanc/dicom-web/[...path] — session gate", () => {
  it("passes through without session check (public for OHIF iframe)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{ ID: "study-1" }]), { status: 200 }),
    );

    const res = await GET(req("/api/orthanc/dicom-web/studies"), {
      params: Promise.resolve({ path: ["studies"] }),
    });

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("passes through even without a valid session token", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(null);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{ ID: "study-1" }]), { status: 200 }),
    );

    const res = await GET(req("/api/orthanc/dicom-web/studies", "geraldos_session=forged"), {
      params: Promise.resolve({ path: ["studies"] }),
    });

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("forwards to Orthanc without wildcard CORS", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(session as never);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{ ID: "study-1" }]), { status: 200 }),
    );

    const res = await GET(req("/api/orthanc/dicom-web/studies?limit=5", "geraldos_session=valid"), {
      params: Promise.resolve({ path: ["studies"] }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://orthanc.test:8042/dicom-web/studies?limit=5",
      expect.objectContaining({ method: "GET" }),
    );

    fetchSpy.mockRestore();
  });
});
