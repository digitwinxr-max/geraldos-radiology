import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

/**
 * Bundle analysis (Phase 10): run with ANALYZE=true to emit webpack-bundle-
 * analyzer HTML reports under .next/analyze. The reports are webpack-based,
 * so pair it with `next build --webpack` (the default Turbopack build skips
 * them). Reads ANALYZE from process.env directly — build-time only, same
 * documented exception class as logger.ts.
 */
const analyzer = withBundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

/**
 * GeraldOS — Security Headers
 *
 * The App Router runtime needs 'unsafe-inline' for script-src (inline flight
 * data) and, in dev, 'unsafe-eval' plus websocket connections for HMR.
 *
 * The OHIF viewer is mounted on THIS origin at /viewer (see `rewrites()`
 * below), so `frame-src`/`connect-src` need no external origin at all and the
 * iframe is admitted by `frame-ancestors 'self'` on the viewer namespace.
 */

/** Paths served by the embedded OHIF viewer rather than by GeraldOS itself. */
const VIEWER_NAMESPACE = "viewer|assets|app-config\\.js|api/ohif";

function contentSecurityPolicy(): string {
  const isProduction = process.env.NODE_ENV === "production";

  const scriptSrc = isProduction
    ? "'self' 'unsafe-inline'"
    : "'self' 'unsafe-inline' 'unsafe-eval'";
  const connectSrc = isProduction ? "'self'" : "'self' ws: wss:";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function securityHeaders(): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy() },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ];
}

/**
 * Headers for the proxied viewer namespace.
 *
 * Two differences from the app policy, both deliberate:
 *
 * 1. Framing is allowed from this origin only (`frame-ancestors 'self'` +
 *    `X-Frame-Options: SAMEORIGIN`) because /imaging and /workstation embed
 *    the viewer in an iframe. The app-wide `DENY`/`frame-ancestors 'none'`
 *    would make the browser refuse to render it.
 * 2. The app's `script-src`/`worker-src` rules are NOT imposed. OHIF is a
 *    third-party SPA that needs workers, `wasm-unsafe-eval` and blob: URLs for
 *    the Cornerstone codecs; the exact set varies by viewer version and cannot
 *    be validated in a browserless environment, so a guessed policy risks a
 *    silently broken viewer. Embedding is still locked to this origin and the
 *    viewer is behind authentication. Tightening this is a follow-up once the
 *    deployed viewer can be exercised in a real browser (docs/KNOWN_ISSUES.md).
 */
function viewerHeaders(): { key: string; value: string }[] {
  return [
    {
      key: "Content-Security-Policy",
      value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
    },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ];
}

/**
 * Same-origin mounting of the OHIF viewer.
 *
 * Destinations are internal (`/api/ohif/...`), so these rewrites are resolved
 * at build time without needing OHIF_URL — the proxy route reads the upstream
 * address from the environment at runtime. That matters because Render does not
 * inject runtime env vars into the Docker build stage.
 *
 * They are `afterFiles`, so GeraldOS's own pages, `public/` files and `/_next`
 * assets always win; only paths the app does not own fall through to OHIF.
 */
function viewerRewrites() {
  return [
    // SPA shell and client-side routes (routerBasename is "/viewer").
    { source: "/viewer", destination: "/api/ohif/" },
    { source: "/viewer/:path*", destination: "/api/ohif/:path*" },
    // The viewer bundle is built with PUBLIC_URL=/, so it requests its own
    // assets from the origin root. GeraldOS has no /assets namespace.
    { source: "/assets/:path*", destination: "/api/ohif/assets/:path*" },
    // The viewer configuration baked into the OHIF image.
    { source: "/app-config.js", destination: "/api/ohif/app-config.js" },
    // Any other root-level static file the bundle references (favicons, logos,
    // manifests, wasm, source maps) — so the mount keeps working across OHIF
    // versions without enumerating its build output.
    {
      source:
        "/:file([^/]+\\.(?:js|mjs|css|wasm|map|json|webmanifest|png|jpe?g|svg|ico|gif|webp|avif|woff2?|ttf|eot|otf|txt|xml))",
      destination: "/api/ohif/:file",
    },
  ];
}

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    // The viewer policy is attached to every path that can serve it — the
    // public mount (/viewer…) and the internal proxy target (/api/ohif/…) — so
    // the result is the same whichever one the router matches a rewrite
    // against. Duplicated identical values are harmless; a stray app-wide
    // `X-Frame-Options: DENY` on the framed document would not be.
    const viewer = viewerHeaders();
    return [
      {
        source: `/((?!${VIEWER_NAMESPACE}).*)`,
        headers: securityHeaders(),
      },
      { source: "/viewer", headers: viewer },
      { source: "/viewer/:path*", headers: viewer },
      { source: "/api/ohif/:path*", headers: viewer },
    ];
  },
  async rewrites() {
    return { beforeFiles: [], afterFiles: viewerRewrites(), fallback: [] };
  },
};

export default analyzer(nextConfig);
