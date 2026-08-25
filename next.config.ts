import type { NextConfig } from "next";

/**
 * GeraldOS — Security Headers
 *
 * Applied to every response via headers(). The CSP is tuned for the App
 * Router runtime: inline flight-data scripts require 'unsafe-inline' for
 * script-src, and dev mode additionally needs 'unsafe-eval' (HMR) plus
 * websocket connections. The OHIF viewer is embedded via iframe, so its
 * origin (OHIF_URL) is admitted in frame-src when configured.
 */

function contentSecurityPolicy(): string {
  const isProduction = process.env.NODE_ENV === "production";

  const scriptSrc = isProduction
    ? "'self' 'unsafe-inline'"
    : "'self' 'unsafe-inline' 'unsafe-eval'";
  const connectSrc = isProduction ? "'self'" : "'self' ws: wss:";

  // The OHIF viewer is embedded in an iframe on the imaging/workstation pages.
  let frameSrc = "'self'";
  const ohifUrl = process.env.OHIF_URL ?? "";
  if (ohifUrl) {
    try {
      frameSrc += ` ${new URL(ohifUrl).origin}`;
    } catch {
      // Ignore malformed OHIF_URL — frame-src stays same-origin only.
    }
  }

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    `frame-src ${frameSrc}`,
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

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders(),
      },
    ];
  },
};

export default nextConfig;
