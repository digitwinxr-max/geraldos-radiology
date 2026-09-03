#!/usr/bin/env node
/**
 * GeraldOS — in-container edge proxy (production entry point).
 *
 * Topology (Render / Docker Compose):
 *
 *   browser → :$PORT (this proxy)
 *               ├── /viewer/*, OHIF static assets  →  OHIF_URL   (private OHIF service)
 *               └── everything else                →  Next.js standalone (127.0.0.1:$NEXT_PORT)
 *
 * Why: the workstation embeds OHIF in an iframe and the session cookie is
 * SameSite=Lax. Cross-origin XHR from a separately-hosted OHIF can never carry
 * that cookie, so the embedded viewer could not authenticate. Serving OHIF
 * through the SAME origin (prefix /viewer) makes every DICOMweb call
 * same-origin: the cookie flows, no CORS exists, and Orthanc credentials stay
 * server-side. OHIF itself therefore never needs a public URL — it is deployed
 * as a Render PRIVATE service reachable only from this container.
 *
 * The proxy is a thin streaming pass-through (no buffering, no rewriting):
 * it preserves status codes, headers, binary bodies, multipart responses and
 * the SSE event stream. Routing is decided at RUNTIME from OHIF_URL, which is
 * only resolvable inside the deployment network (Next rewrites are baked at
 * build time and cannot be used for this).
 */

import http from "node:http";
import { spawn } from "node:child_process";
import { createHmac, timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOSTNAME || "0.0.0.0";
const NEXT_PORT = Number(process.env.NEXT_PORT || 3001);
const NEXT_HOST = "127.0.0.1";
const OHIF_URL = (process.env.OHIF_URL || "").replace(/\/+$/, "");
const SESSION_COOKIE = "geraldos_session";
const AUTH_SECRET = process.env.AUTH_SECRET || "";

/**
 * Verify the GeraldOS session JWT (HS256) without dependencies.
 *
 * Mirrors src/lib/auth/session.ts:the key is the raw AUTH_SECRET UTF-8 bytes
 * (TextEncoder.encode(env.authSecret)); the signature is HMAC-SHA256 over
 * `header.payload`;and exp (seconds since epoch) is honoured when present．
 * Used to gate the /viewer mount — requests that never reach Next's own proxy.

 * Returns true when the cookie is present and cryptographically valid。
 */
function hasValidSession(req) {
  if (!AUTH_SECRET) return false;
  const header = req.headers.cookie ?? "";
  const match = header.split(";").map((s) => s.trim()).find((p) => p.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return false;
  const token = match.slice(SESSION_COOKIE.length + 1);
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [h, p, s] = parts;
  if (!h || !p || !s) return false;
  const data = `${h}.${p}`;
  const key = Buffer.from(AUTH_SECRET, "utf8");
  const expected = createHmac("sha256", key).update(data).digest("base64url");
  let sig;
  try {
    sig = Buffer.from(s, "base64url");
  } catch {
    return false;
  }
  const expBuf = Buffer.from(expected, "base64url");
  if (sig.length !== expBuf.length || !timingSafeEqual(sig, expBuf)) return false;
  try {
    const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) return false;
    if (typeof payload.iat === "number" && payload.iat * 1000 > Date.now() + 60_000) return false;
  } catch {
    return false;
  }
  return true;
}

/** Browser path prefix under which OHIF is mounted (must match ohif-config/app-config.js routerBasename). */
const VIEWER_PREFIX = "/viewer";

/**
 * Root-level OHIF asset patterns, derived from the built ohif/app image:
 *   /app-config.js, /manifest.json, /init-service-worker.js (exact files),
 *   /assets/<icons>, /app.bundle.<hash>.js|css and lazily-loaded chunks
 *   (<id>.bundle.<hash>.js, <id>.css) plus cornerstone .wasm payloads.
 * Anything matched here is forwarded to OHIF with the /viewer prefix stripped
 * for SPA routes and 1:1 for root assets.
 */
const OHIF_ROOT_FILES = new Set([
  "/app-config.js",
  "/manifest.json",
  "/env.js",
]);
const OHIF_ROOT_PREFIXES = ["/assets/", "/app.bundle.", "/static/"];
const OHIF_CHUNK_PATTERN = /^\/\d+(\.bundle\.[0-9a-f]+)?\.(js|css)$/;
const OHIF_WASM_PATTERN = /^\/[0-9a-f]+\.wasm$/;

/**
 * Service workers registered from the viewer iframe would take scope "/" on
 * the app origin and intercept the parent application's requests. The viewer
 * is a same-origin iframe of a first-party app — SW caching of clinical data
 * is not wanted. Registration fails silently in OHIF when these 404.
 */
const BLOCKED_PATHS = new Set(["/init-service-worker.js", "/service-worker.js"]);

function isOhifPath(pathname) {
  if (!OHIF_URL) return false;
  if (pathname === VIEWER_PREFIX || pathname.startsWith(`${VIEWER_PREFIX}/`)) return true;
  if (OHIF_ROOT_FILES.has(pathname)) return true;
  if (OHIF_ROOT_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  return OHIF_CHUNK_PATTERN.test(pathname) || OHIF_WASM_PATTERN.test(pathname);
}

/**
 * Map a browser URL to the OHIF upstream URL.
 * /viewer and /viewer/* are prefix-stripped (OHIF nginx falls back to
 * index.html so SPA routes resolve); root assets map 1:1.
 */
function ohifTarget(reqUrl) {
  const url = new URL(reqUrl, "http://edge");
  let pathname = url.pathname;
  if (pathname === VIEWER_PREFIX) pathname = "/";
  else if (pathname.startsWith(`${VIEWER_PREFIX}/`)) pathname = pathname.slice(VIEWER_PREFIX.length) || "/";
  return `${OHIF_URL}${pathname}${url.search}`;
}

function proxy(req, res, target, opts = {}) {
  const upstream = new URL(target);
  const headers = { ...req.headers };
  delete headers.host;
  if (opts.preserveHost) {
    // The GeraldOS origin must survive the proxy: Next derives request.nextUrl
    // from these, and the app's strict CSRF check requires the browser Origin to
    // equal nextUrl.origin. Render terminates TLS externally, so the public
    // scheme comes from PUBLIC_APP_URL (fallback: http).
    headers.host = req.headers.host;
    const pubUrl = process.env.PUBLIC_APP_URL;
    const proto = pubUrl ? new URL(pubUrl).protocol.replace(/:/, "") : "http";
    headers["x-forwarded-host"] = req.headers.host;
    headers["x-forwarded-proto"] = proto;
  } else {
    headers.host = upstream.host;
  }

  const ureq = http.request(
    {
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port,
      method: req.method,
      path: `${upstream.pathname}${upstream.search}`,
      headers,
    },
    (ures) => {
      res.writeHead(ures.statusCode ?? 502, ures.headers);
      ures.pipe(res);
    },
  );

  ureq.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { code: "UPSTREAM_UNAVAILABLE", message: "Upstream service unreachable" } }));
    } else {
      res.end();
    }
  });

  req.pipe(ureq);
  req.on("error", () => ureq.destroy());
  res.on("close", () => ureq.destroy());
}

// ─── Start the Next.js standalone server as a child process ───
const next = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(NEXT_PORT), HOSTNAME: NEXT_HOST },
  stdio: "inherit",
});
next.on("exit", (code, signal) => {
  console.error(`[edge-proxy] Next.js server exited (code=${code} signal=${signal}) — shutting down`);
  process.exit(code ?? 1);
});
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    next.kill(sig);
    setTimeout(() => process.exit(0), 2000).unref();
  });
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://edge");
  if (BLOCKED_PATHS.has(pathname)) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
    return;
  }
  if (isOhifPath(pathname)) {
    // The viewer shell executes on the app origin → same-origin cookies flow on
    // every OHIF subresource automatically. Gate the whole mount here because
    // it never passes through Next's own proxy (src/proxy.ts).
    if (!hasValidSession(req)) {
      if (pathname === VIEWER_PREFIX || pathname.startsWith(`${VIEWER_PREFIX}/`)) {
        res.writeHead(307, { location: "/login" });
        res.end();
      } else {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }));
      }
      return;
    }
    return proxy(req, res, ohifTarget(req.url ?? "/"));
  }
  return proxy(req, res, `http://${NEXT_HOST}:${NEXT_PORT}${req.url ?? "/"}`, { preserveHost: true });
});
// Radiology imaging payloads are large; give streams room without buffering.
server.headersTimeout = 120_000;
server.requestTimeout = 0;
server.keepAliveTimeout = 65_000;

server.listen(PORT, HOST, () => {
  console.log(`[edge-proxy] listening on ${HOST}:${PORT} → next@${NEXT_HOST}:${NEXT_PORT}${OHIF_URL ? ` | ohif@${OHIF_URL} (mount ${VIEWER_PREFIX})` : " | OHIF not configured"}`);
});
