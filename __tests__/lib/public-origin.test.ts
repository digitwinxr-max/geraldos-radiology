import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { publicOrigin } from "@/lib/public-origin";

/**
 * The production failure these tests pin down: behind Render's TLS-terminating
 * router the container binds 0.0.0.0:$PORT, and Next resolves `nextUrl.origin`
 * from that bind address — NOT from the Host header — so it yields
 * `https://0.0.0.0:3000`. Verified against Next 16.2.6
 * (server/lib/router-utils/resolve-routes.js, `experimental.trustHostHeader`
 * false) and against the built standalone server.
 */
const BIND_URL = "https://0.0.0.0:3000/api/patients";

function request(headers: Record<string, string> = {}, url = BIND_URL): NextRequest {
  return new NextRequest(url, { method: "POST", headers });
}

describe("publicOrigin", () => {
  it("reproduces the broken bind-address origin that Next exposes", () => {
    // Guard: if a future Next starts trusting the Host header, this test tells
    // us the workaround below is no longer load-bearing.
    expect(
      request({ host: "geraldos-radiology.onrender.com", "x-forwarded-proto": "https" })
        .nextUrl.origin,
    ).toBe("https://0.0.0.0:3000");
  });

  it("returns the browser-facing origin on Render (forwarded proto + host)", () => {
    expect(
      publicOrigin(
        request({ host: "geraldos-radiology.onrender.com", "x-forwarded-proto": "https" }),
      ),
    ).toBe("https://geraldos-radiology.onrender.com");
  });

  it("prefers x-forwarded-host over host", () => {
    expect(
      publicOrigin(
        request({
          host: "internal-router:3000",
          "x-forwarded-host": "app.gerald.co.bw",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toBe("https://app.gerald.co.bw");
  });

  it("uses the first hop of a comma-separated forwarded list", () => {
    expect(
      publicOrigin(
        request({
          "x-forwarded-host": "app.gerald.co.bw, internal-proxy",
          "x-forwarded-proto": "https, http",
        }),
      ),
    ).toBe("https://app.gerald.co.bw");
  });

  it("omits the default port so the value matches a browser Origin", () => {
    expect(publicOrigin(request({ host: "app.gerald.co.bw:443", "x-forwarded-proto": "https" }))).toBe(
      "https://app.gerald.co.bw",
    );
    expect(publicOrigin(request({ host: "localhost:80", "x-forwarded-proto": "http" }))).toBe(
      "http://localhost",
    );
  });

  it("keeps a non-default port", () => {
    expect(publicOrigin(request({ host: "localhost:3000", "x-forwarded-proto": "http" }))).toBe(
      "http://localhost:3000",
    );
  });

  it("falls back to nextUrl.origin when no host header is present", () => {
    // Unit tests and direct local serving have no proxy headers: behaviour is
    // exactly what it was before, so docker compose and `next dev` are
    // unaffected.
    expect(publicOrigin(request({}, "http://localhost:3000/api/patients"))).toBe(
      "http://localhost:3000",
    );
  });

  it("takes the scheme from x-forwarded-proto when the socket is plain http", () => {
    expect(
      publicOrigin(request({ host: "geraldos-radiology.onrender.com", "x-forwarded-proto": "https" },
        "http://0.0.0.0:3000/api/patients")),
    ).toBe("https://geraldos-radiology.onrender.com");
  });
});
