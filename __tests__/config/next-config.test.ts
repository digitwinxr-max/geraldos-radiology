/**
 * Deployment topology — next.config.ts.
 *
 * These assertions are the regression guard for the same-origin viewer mount.
 * Two properties matter on Render and are easy to break silently:
 *
 *  - Every rewrite destination is an INTERNAL route. `next.config.ts` is
 *    evaluated during `next build`, where Render has not injected any runtime
 *    env var, so a destination containing `OHIF_URL` would be baked in empty
 *    and the viewer would 404 in production.
 *  - The app-wide `X-Frame-Options: DENY` / `frame-ancestors 'none'` must NOT
 *    apply to the viewer namespace, or the browser refuses to render the iframe
 *    that /imaging and /workstation embed.
 */

import { describe, expect, it } from "vitest";

import type { NextConfig } from "next";
import config from "../../next.config";

type HeaderEntry = { source: string; headers: { key: string; value: string }[] };
type RewriteEntry = { source: string; destination: string };

const headers = (async () => (await config.headers!()) as HeaderEntry[])();
const rewrites = (async () => {
  const r = await config.rewrites!();
  return (Array.isArray(r) ? r : r.afterFiles) as RewriteEntry[];
})();

function headerFor(entries: HeaderEntry[], source: string) {
  return entries.find((e) => e.source === source);
}

function value(entries: HeaderEntry[], source: string, key: string) {
  const entry = headerFor(entries, source);
  return entry?.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;
}

describe("next.config — build output", () => {
  it("emits a standalone bundle for the Docker runtime image", () => {
    expect((config as NextConfig).output).toBe("standalone");
  });
});

describe("next.config — viewer rewrites", () => {
  it("mounts the viewer namespace onto the internal proxy route", async () => {
    const r = await rewrites;
    const bySource = Object.fromEntries(r.map((x) => [x.source, x.destination]));

    expect(bySource["/viewer"]).toBe("/api/ohif/");
    expect(bySource["/viewer/:path*"]).toBe("/api/ohif/:path*");
    // The bundle is built with PUBLIC_URL=/, so it fetches its assets from the
    // origin root; GeraldOS owns that root for it.
    expect(bySource["/assets/:path*"]).toBe("/api/ohif/assets/:path*");
    expect(bySource["/app-config.js"]).toBe("/api/ohif/app-config.js");
  });

  it("has a fallback for other root-level static files the bundle references", async () => {
    const r = await rewrites;
    const fallback = r.find((x) => x.source.startsWith("/:file("));

    expect(fallback).toBeDefined();
    expect(fallback?.destination).toBe("/api/ohif/:file");
    // `[^/]+` matches a SINGLE root-level segment, so it structurally cannot
    // capture /api/…, /_next/… or any nested app route. Combined with afterFiles
    // ordering (filesystem routes win first), it can only ever catch a stray
    // root-level viewer asset such as /favicon.ico or /manifest.webmanifest.
    expect(fallback?.source).toContain("[^/]+");
    expect(fallback?.source).not.toContain(":path*");
  });

  it("keeps every destination internal — no build-time env dependency", async () => {
    const r = await rewrites;
    expect(r.length).toBeGreaterThan(0);
    for (const { destination } of r) {
      expect(destination.startsWith("/api/ohif")).toBe(true);
      expect(destination).not.toMatch(/^https?:\/\//);
    }
  });
});

describe("next.config — security headers", () => {
  it("excludes the viewer namespace from the app-wide framing ban", async () => {
    const h = await headers;
    const appWide = h[0];

    expect(appWide.source).toBe("/((?!viewer|assets|app-config\\.js|api/ohif).*)");
    expect(value(h, appWide.source, "X-Frame-Options")).toBe("DENY");
    expect(value(h, appWide.source, "Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });

  it("allows same-origin framing on every path that can serve the viewer", async () => {
    const h = await headers;

    for (const source of ["/viewer", "/viewer/:path*", "/api/ohif/:path*"]) {
      expect(headerFor(h, source), source).toBeDefined();
      expect(value(h, source, "X-Frame-Options")).toBe("SAMEORIGIN");
      expect(value(h, source, "Content-Security-Policy")).toContain("frame-ancestors 'self'");
      expect(value(h, source, "Content-Security-Policy")).not.toContain("frame-ancestors 'none'");
      expect(value(h, source, "X-Content-Type-Options")).toBe("nosniff");
    }
  });

  it("admits no external origin in the app CSP now that the viewer is same-origin", async () => {
    const h = await headers;
    const csp = value(h, h[0].source, "Content-Security-Policy") ?? "";

    expect(csp).toContain("frame-src 'self'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toMatch(/https?:\/\//);
    expect(csp).not.toContain("onrender.com");
  });
});
