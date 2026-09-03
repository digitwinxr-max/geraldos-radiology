/**
 * Gate + behaviour — same-origin OHIF viewer proxy.
 *
 * The viewer is mounted at /viewer on the GeraldOS origin and served by this
 * route. Two things must hold in production:
 *
 *  1. It is authenticated. The viewer UI (and its JS bundle) is reachable only
 *     with a valid GeraldOS session, so an anonymous visitor cannot even load
 *     the shell of a clinical imaging tool.
 *  2. It leaks nothing. The upstream address stays server-side, the session
 *     cookie is never forwarded to OHIF, and upstream redirects are re-rooted
 *     onto /viewer so OHIF's internal namespace never reaches the browser.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { ohifConfig } = vi.hoisted(() => ({
  ohifConfig: { url: "http://geraldos-ohif-ab1c:3001" },
}));

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...actual, verifySessionToken: vi.fn() };
});
vi.mock("@/lib/integrations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations")>();
  return {
    ...actual,
    integrationConfig: { ...actual.integrationConfig, ohif: ohifConfig },
  };
});

import { verifySessionToken } from "@/lib/auth/session";
import { OHIF_MOUNT_PREFIX } from "@/lib/integrations";
import { GET, HEAD, POST } from "@/app/api/ohif/[[...path]]/route";

const session = { sub: "u1", name: "User", roles: ["radiologist"], iss: "test" };

function req(path: string, cookie?: string, init?: RequestInit): NextRequest {
  const headers = new Headers(init?.headers);
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(`http://localhost${path}`, { method: init?.method, headers });
}

function params(...path: string[]) {
  return { params: Promise.resolve(path.length ? { path } : {}) };
}

beforeEach(() => {
  vi.clearAllMocks();
  ohifConfig.url = "http://geraldos-ohif-ab1c:3001";
});

describe("GET /api/ohif/[[...path]] — session gate", () => {
  it("returns 401 without a session cookie and never contacts the viewer", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("shell", { status: 200 }));

    const res = await GET(req("/api/ohif/"), params());

    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("returns 401 when the session token is forged", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(null);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("shell", { status: 200 }));

    const res = await GET(req("/api/ohif/", "geraldos_session=forged"), params());

    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("reports 503 NOT_CONFIGURED when OHIF_URL is absent", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(session as never);
    ohifConfig.url = "";

    const res = await GET(req("/api/ohif/", "geraldos_session=valid"), params());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error.code).toBe("NOT_CONFIGURED");
  });

  it("rejects traversal segments before anything is forwarded", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(session as never);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("x", { status: 200 }));

    const res = await GET(req("/api/ohif/..", "geraldos_session=valid"), params(".."));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_FAILED");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("refuses methods other than GET/HEAD", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(session as never);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("x", { status: 200 }));

    const res = await POST(
      req("/api/ohif/", "geraldos_session=valid", { method: "POST" }),
      params(),
    );

    expect(res.status).toBe(405);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("GET /api/ohif/[[...path]] — proxying", () => {
  it("serves the SPA shell at the mount root, keeping the query string", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(session as never);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html>ohif</html>", { status: 200, headers: { "content-type": "text/html" } }),
    );

    // /viewer/viewer?StudyInstanceUIDs=… is rewritten to /api/ohif/viewer?…
    const res = await GET(
      req("/api/ohif/viewer?StudyInstanceUIDs=1.2.3", "geraldos_session=valid"),
      params("viewer"),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html");
    expect(await res.text()).toBe("<html>ohif</html>");
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://geraldos-ohif-ab1c:3001/viewer?StudyInstanceUIDs=1.2.3",
      expect.objectContaining({ method: "GET", redirect: "manual" }),
    );
    fetchSpy.mockRestore();
  });

  it("maps root-level bundle assets onto the upstream document root", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(session as never);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("console.log(1)", { status: 200, headers: { "content-type": "application/javascript" } }),
    );

    const res = await GET(
      req("/api/ohif/assets/index-abc123.js", "geraldos_session=valid"),
      params("assets", "index-abc123.js"),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/javascript");
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://geraldos-ohif-ab1c:3001/assets/index-abc123.js",
      expect.anything(),
    );
    fetchSpy.mockRestore();
  });

  it("never forwards the GeraldOS session cookie to the viewer service", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(session as never);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

    await GET(req("/api/ohif/", "geraldos_session=super-secret-token"), params());

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.cookie).toBeUndefined();
    expect(JSON.stringify(headers)).not.toContain("super-secret-token");
    fetchSpy.mockRestore();
  });

  it("relays conditional-request headers and honours a 304", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(session as never);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 304, headers: { etag: '"v1"' } }),
    );

    const res = await GET(
      req("/api/ohif/assets/app.js", "geraldos_session=valid", {
        headers: { "if-none-match": '"v1"' },
      }),
      params("assets", "app.js"),
    );

    expect(res.status).toBe(304);
    expect(res.headers.get("etag")).toBe('"v1"');
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["if-none-match"]).toBe('"v1"');
    fetchSpy.mockRestore();
  });

  it("re-roots an upstream redirect onto the public mount prefix", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(session as never);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 301, headers: { location: "/index.html" } }),
    );

    const res = await GET(req("/api/ohif/", "geraldos_session=valid"), params());

    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(`${OHIF_MOUNT_PREFIX}/index.html`);
    fetchSpy.mockRestore();
  });

  it("re-roots an absolute upstream redirect but leaves external links alone", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(session as never);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "http://geraldos-ohif-ab1c:3001/assets/" } }),
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "https://example.com/other" } }),
      );

    const internal = await GET(req("/api/ohif/assets", "geraldos_session=valid"), params("assets"));
    expect(internal.headers.get("location")).toBe(`${OHIF_MOUNT_PREFIX}/assets/`);

    const external = await GET(req("/api/ohif/x", "geraldos_session=valid"), params("x"));
    expect(external.headers.get("location")).toBe("https://example.com/other");
    fetchSpy.mockRestore();
  });

  it("drops content-encoding/length so the streamed body stays intact", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(session as never);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("payload", {
        status: 200,
        headers: { "content-type": "text/plain", "content-encoding": "gzip", "content-length": "999" },
      }),
    );

    const res = await GET(req("/api/ohif/x.txt", "geraldos_session=valid"), params("x.txt"));

    expect(res.headers.get("content-encoding")).toBeNull();
    expect(res.headers.get("content-length")).toBeNull();
    expect(await res.text()).toBe("payload");
    fetchSpy.mockRestore();
  });

  it("returns 502 when the viewer service is unreachable", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(session as never);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await GET(req("/api/ohif/", "geraldos_session=valid"), params());

    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("INTEGRATION_ERROR");
    fetchSpy.mockRestore();
  });

  it("answers HEAD without a body", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(session as never);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("shell", { status: 200, headers: { "content-type": "text/html" } }),
    );

    const res = await HEAD(req("/api/ohif/", "geraldos_session=valid", { method: "HEAD" }), params());

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html");
    expect(await res.text()).toBe("");
    fetchSpy.mockRestore();
  });
});
