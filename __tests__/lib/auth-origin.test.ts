/**
 * Gate — `publicAppOrigin` resolution.
 *
 * `PUBLIC_APP_URL` must override the incoming request origin when configured
 * (production behind TLS-terminating proxies), while development behaviour
 * (falling back to the request origin) must remain intact when it is absent.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { publicAppOrigin } from "@/lib/auth/origin";

beforeEach(() => vi.unstubAllEnvs());
afterEach(() => vi.unstubAllEnvs());

describe("publicAppOrigin", () => {
  it("uses PUBLIC_APP_URL when configured, ignoring the internal request origin", () => {
    vi.stubEnv("PUBLIC_APP_URL", "https://geraldos-radiology.onrender.com");

    const req = new NextRequest("https://0.0.0.0:10000/api/auth/login");

    expect(publicAppOrigin(req)).toBe("https://geraldos-radiology.onrender.com");
  });

  it("strips trailing slashes from PUBLIC_APP_URL", () => {
    vi.stubEnv("PUBLIC_APP_URL", "https://geraldos-radiology.onrender.com/");

    const req = new NextRequest("https://0.0.0.0:10000/");

    expect(publicAppOrigin(req)).toBe("https://geraldos-radiology.onrender.com");
  });

  it("falls back to the request origin when PUBLIC_APP_URL is absent (development)", () => {
    vi.stubEnv("PUBLIC_APP_URL", "");

    const req = new NextRequest("http://localhost:3000/api/auth/login");

    expect(publicAppOrigin(req)).toBe("http://localhost:3000");
  });
});