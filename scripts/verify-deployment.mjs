#!/usr/bin/env node
/**
 * GeraldOS — live deployment verification.
 *
 * Runs the acceptance checks against an ACTUAL deployed instance (Render or
 * otherwise). Static tests prove the code is correct; this proves the deployed
 * topology is correct — that PostgreSQL, Orthanc and OHIF are reachable from
 * inside the private network and that the browser-facing path
 *
 *     /viewer → OHIF → /api/orthanc/dicom-web → private Orthanc
 *
 * really works end to end.
 *
 * Usage:
 *   APP_URL=https://geraldos-radiology.onrender.com \
 *   ADMIN_EMAIL=admin@example.com \
 *   ADMIN_PASSWORD=... \
 *   node scripts/verify-deployment.mjs
 *
 * Options:
 *   SESSION_TOKEN    verify with an existing session instead of credentials
 *                    (avoids putting the admin password in a shell command)
 *   --skip-upload    do not POST a DICOM sample (default: uploads
 *                    dicom-samples/CT001_001.dcm if the file is present)
 *   --strict         exit non-zero on WARN as well as FAIL
 *
 * SECURITY: credentials are read from the environment only. Neither the
 * password, the session token, nor any Set-Cookie value is ever printed —
 * output is status codes and boolean assertions only. Do not paste this
 * command with inline secrets into shared logs; export them instead.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");

const APP_URL = (process.env.APP_URL ?? process.argv[2] ?? "").replace(/\/+$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const SESSION_TOKEN = process.env.SESSION_TOKEN ?? "";
const SKIP_UPLOAD = process.argv.includes("--skip-upload");
const STRICT = process.argv.includes("--strict");

const COOKIE = "geraldos_session";

if (!APP_URL) {
  console.error("APP_URL is required, e.g. APP_URL=https://geraldos-radiology.onrender.com");
  process.exit(2);
}
// HTTPS is required for anything public. Loopback is exempt so this harness can
// also be run against a local `docker compose` stack during development.
const isLoopback = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(`${APP_URL}/`);
if (!/^https:\/\//.test(APP_URL) && !isLoopback) {
  console.error(`Refusing to run against a non-HTTPS, non-loopback origin: ${APP_URL}`);
  process.exit(2);
}

let session = "";
const results = [];
let studyUid = "";

function record(id, name, verdict, detail = "") {
  results.push({ id, name, verdict, detail });
  const tag = verdict === "PASS" ? "PASS" : verdict === "FAIL" ? "FAIL" : verdict === "WARN" ? "WARN" : "SKIP";
  console.log(`${tag}  ${id}  ${name}${detail ? `  — ${detail}` : ""}`);
}

/** Fetch that never follows redirects, so cookie/redirect behaviour is observable. */
async function req(url, init = {}) {
  const headers = new Headers(init.headers ?? {});
  if (session && !headers.has("cookie")) headers.set("cookie", `${COOKIE}=${session}`);
  // Every request is same-origin by construction: a real browser on the
  // deployed host sends exactly this.
  if (!headers.has("origin")) headers.set("origin", APP_URL);
  const res = await fetch(`${APP_URL}${url}`, { ...init, headers, redirect: "manual" });
  return res;
}

function captureSession(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    if (c.startsWith(`${COOKIE}=`) && !c.includes("=;") && !/=\s*;/.test(c)) {
      session = c.slice(COOKIE.length + 1).split(";")[0];
      return true;
    }
  }
  return false;
}

async function body(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function assert(id, name, condition, detail = "") {
  record(id, name, condition ? "PASS" : "FAIL", detail);
  return Boolean(condition);
}

// ─── 1. health + PostgreSQL reachability ────────────────────────────────────
async function checkHealth() {
  let res;
  try {
    res = await req("/api/health");
  } catch (error) {
    assert("H1", "/api/health responds", false, `${error.name}: ${error.message}`);
    throw new Error("unreachable");
  }
  const json = await body(res);
  assert("H1", "/api/health returns 200", res.status === 200, `status=${res.status}`);
  assert(
    "H2",
    "PostgreSQL is reachable from the deployed app (db.ok)",
    json?.db?.ok === true,
    json?.db ? `ok=${json.db.ok} latencyMs=${json.db.latencyMs ?? "?"} reason=${json.db.reason ?? "-"}` : `status=${json?.status ?? "?"}`,
  );
  // The health contract has three states: "healthy" (DB probe OK, 200),
  // "degraded" (DATABASE_URL not set at all, 200) and "unhealthy" (probe
  // failed, 503). Anything other than "healthy" is a misconfiguration — in
  // particular "degraded" means the Blueprint never wired DATABASE_URL.
  assert(
    "H3",
    'the service reports status "healthy"',
    json?.status === "healthy",
    `status=${json?.status ?? "?"}${json?.error?.code ? ` code=${json.error.code}` : ""}`,
  );
}

// ─── 2. unauthenticated access is rejected ──────────────────────────────────
async function checkUnauthenticated() {
  const worklist = await req("/api/worklist");
  assert("A1", "unauthenticated /api/worklist is rejected", worklist.status === 401, `status=${worklist.status}`);

  const dicomweb = await req("/api/orthanc/dicom-web/studies?limit=1");
  assert("A2", "unauthenticated DICOMweb QIDO is rejected", dicomweb.status === 401, `status=${dicomweb.status}`);

  const viewer = await req("/viewer");
  const denied = viewer.status === 401 || viewer.status === 403 ||
    [301, 302, 303, 307, 308].includes(viewer.status);
  assert("A3", "unauthenticated /viewer is not served", denied, `status=${viewer.status}`);
  if ([301, 302, 303, 307, 308].includes(viewer.status)) {
    const loc = viewer.headers.get("location") ?? "";
    assert("A4", "the /viewer redirect targets the app origin, never 0.0.0.0", !loc.includes("0.0.0.0"), `location=${loc}`);
  }
}

// ─── 3. login ───────────────────────────────────────────────────────────────
async function checkLogin() {
  if (SESSION_TOKEN) {
    session = SESSION_TOKEN;
    // Probe an auth-gated endpoint that stays 200 even when PostgreSQL is down,
    // so token mode validates the session without depending on the database.
    const probe = await req("/api/integrations/status");
    const accepted = probe.status === 200;
    assert("L1", "the supplied SESSION_TOKEN is accepted", accepted, `status=${probe.status}`);
    // Cookie attributes are only observable on the response that sets them.
    record("L2", "login issues a session cookie", "SKIP", "SESSION_TOKEN mode — login not exercised");
    for (const [id, name] of [["L3", "HttpOnly"], ["L4", "Secure"], ["L5", "SameSite=Lax or Strict"], ["L6", "not scoped across a public suffix"]]) {
      record(id, `the session cookie is ${name}`, "SKIP", "SESSION_TOKEN mode — Set-Cookie not observed");
    }
    return accepted;
  }
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    record("L1", "login with the bootstrapped administrator", "SKIP", "ADMIN_EMAIL / ADMIN_PASSWORD not set");
    return false;
  }
  const res = await req("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const json = await body(res);
  const ok = res.status === 200 && json?.ok === true;
  assert("L1", "login succeeds for the bootstrapped administrator", ok, `status=${res.status} ok=${json?.ok ?? false}`);
  if (!ok) return false;

  const got = captureSession(res);
  assert("L2", "login issues a session cookie", got && session.length > 0, `cookieSet=${got}`);

  const setCookie = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(`${COOKIE}=`)) ?? "";
  assert("L3", "the session cookie is HttpOnly", /;\s*HttpOnly/i.test(setCookie), "HttpOnly present");
  assert("L4", "the session cookie is Secure", /;\s*Secure/i.test(setCookie), "Secure present");
  const sameSite = (setCookie.match(/;\s*SameSite=(\w+)/i) ?? [])[1] ?? "";
  assert("L5", "the session cookie is SameSite=Lax or Strict", /^(lax|strict)$/i.test(sameSite), `SameSite=${sameSite || "unset"}`);
  // The cookie must NOT be scoped to a public suffix: onrender.com is on the
  // PSL, so Domain=.onrender.com would be rejected by browsers outright.
  assert("L6", "the session cookie is not scoped across a public suffix", !/;\s*Domain=/i.test(setCookie), "host-only cookie");
  return true;
}

// ─── 4. integration reachability from inside the private network ────────────
async function checkIntegrations() {
  const res = await req("/api/integrations/status");
  const json = await body(res);
  assert("I1", "/api/integrations/status returns 200 when authenticated", res.status === 200, `status=${res.status}`);
  if (res.status !== 200) return;

  const items = Array.isArray(json?.integrations) ? json.integrations : [];
  const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
  assert("I2", "PostgreSQL reports connected", byKey.postgres?.status === "connected", `postgres=${byKey.postgres?.status ?? "absent"}`);
  assert("I3", "private Orthanc is reachable from the app", byKey.orthanc?.status === "connected", `orthanc=${byKey.orthanc?.status ?? "absent"} detail=${byKey.orthanc?.detail ?? "-"}`);
  assert("I4", "private OHIF is reachable from the app", byKey.ohif?.status === "connected", `ohif=${byKey.ohif?.status ?? "absent"} detail=${byKey.ohif?.detail ?? "-"}`);

  // No internal infrastructure detail may leak in a status payload.
  // The app's own public host may legitimately appear; a *private* service
  // hostname, a Basic credential or an internal port must never be returned.
  const raw = JSON.stringify(json ?? {}).split(new URL(APP_URL).host).join("");
  assert(
    "I5",
    "the status payload leaks no internal hostname or credential",
    !/(onrender\.com|Basic [A-Za-z0-9+/=]|:\d{4}\b|\b10\.\d+\.\d+\.\d+)/i.test(raw),
    "no private host/port/credential strings",
  );
}

// ─── 5. public client config exposes no internal topology ───────────────────
async function checkClientConfig() {
  const res = await req("/api/integrations/client-config");
  const raw = await res.text();
  assert("C1", "/api/integrations/client-config is reachable", res.status === 200, `status=${res.status}`);
  assert("C2", "the client config exposes no orthancUrl", !raw.includes("orthancUrl"), "orthancUrl absent");
  assert("C3", "the client config exposes no internal Orthanc hostname", !/orthanc-[a-z0-9]{4}|\b10\.\d+\.\d+\.\d+|:8042/.test(raw), "no private address");
  assert("C4", "the viewer is advertised as a same-origin path", raw.includes("/viewer"), "ohifUrl is a path prefix");
}

// ─── 6. authenticated clinical data path ────────────────────────────────────
async function checkClinical() {
  const worklist = await req("/api/worklist");
  assert("W1", "authenticated /api/worklist returns 200", worklist.status === 200, `status=${worklist.status}`);

  const patients = await req("/api/patients?limit=1");
  // Some deployments expose patients under /api/patients; accept 200 or a
  // documented 404 for a route that does not exist, but never a 401.
  assert(
    "W2",
    "authenticated patient API is authorised (not 401/403)",
    patients.status !== 401 && patients.status !== 403,
    `status=${patients.status}`,
  );
}

// ─── 7. DICOMweb through the GeraldOS proxy ─────────────────────────────────
async function checkDicomWeb() {
  const qido = await req("/api/orthanc/dicom-web/studies?limit=5");
  assert("D1", "DICOMweb QIDO-RS /studies returns 200", qido.status === 200, `status=${qido.status}`);
  assert(
    "D2",
    "no wildcard CORS on clinical data",
    (qido.headers.get("access-control-allow-origin") ?? "") !== "*",
    `acao=${qido.headers.get("access-control-allow-origin") ?? "none"}`,
  );

  const studies = await body(qido);
  const list = Array.isArray(studies) ? studies : [];
  studyUid = list[0]?.["0020000D"]?.Value?.[0] ?? "";
  if (!studyUid) {
    record("D3", "WADO-RS series retrieval for a stored study", "SKIP", "PACS holds no study yet — run the upload check first");
    return;
  }
  const series = await req(`/api/orthanc/dicom-web/studies/${encodeURIComponent(studyUid)}/series`);
  assert("D3", "WADO-RS series retrieval for a stored study", series.status === 200, `status=${series.status} study=${studyUid}`);
}

// ─── 8. OHIF viewer mount (same-origin) ─────────────────────────────────────
async function checkViewer() {
  const viewer = await req("/viewer");
  assert("V1", "authenticated /viewer returns 200", viewer.status === 200, `status=${viewer.status}`);
  const html = viewer.status === 200 ? await viewer.text() : "";
  assert("V2", "/viewer serves the OHIF application HTML", /<html/i.test(html), `bytes=${html.length}`);

  const xfo = viewer.headers.get("x-frame-options") ?? "";
  const csp = viewer.headers.get("content-security-policy") ?? "";
  assert(
    "V3",
    "the viewer may be framed by the app origin only",
    /SAMEORIGIN/i.test(xfo) || /frame-ancestors\s+'self'/.test(csp),
    `xfo=${xfo || "-"} csp=${csp || "-"}`,
  );

  const cfg = await req("/viewer/app-config.js");
  const cfgText = cfg.status === 200 ? await cfg.text() : "";
  assert("V4", "the served viewer config is reachable", cfg.status === 200, `status=${cfg.status}`);
  assert(
    "V5",
    "the viewer's DICOMweb datasource targets the GeraldOS same-origin proxy",
    cfgText.includes("/api/orthanc/dicom-web"),
    "datasource path present",
  );
  assert("V6", "the viewer is rooted at /viewer", cfgText.includes("/viewer"), "routerBasename present");
  // Strip comments before scanning: a documentation link in a comment is not a
  // hardcoded upstream host. What matters is that no *live* value points the
  // viewer at an absolute third-party origin (which would bypass the proxy).
  const liveConfig = cfgText.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert(
    "V7",
    "the viewer config hardcodes no absolute upstream host",
    !/https?:\/\/(?!localhost|127\.0\.0\.1)/.test(liveConfig),
    "every configured root is a relative path",
  );

  if (studyUid) {
    const deep = await req(`/viewer/viewer?StudyInstanceUIDs=${encodeURIComponent(studyUid)}`);
    assert("V8", "the study deep link renders through the mount", deep.status === 200, `status=${deep.status}`);
  } else {
    record("V8", "the study deep link renders through the mount", "SKIP", "no study in the PACS yet");
  }

  const traversal = await req("/viewer/../../etc/passwd");
  assert(
    "V9",
    "path traversal cannot escape the viewer mount",
    traversal.status === 400 || traversal.status === 404 || traversal.status === 308,
    `status=${traversal.status}`,
  );
}

// ─── 9. CSRF / public-origin handling behind Render's proxy ─────────────────
async function checkCsrf() {
  const evil = await fetch(`${APP_URL}/api/bookmarks`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `${COOKIE}=${session}`, origin: "https://evil.example.com" },
    body: JSON.stringify({ label: "csrf-probe" }),
    redirect: "manual",
  });
  const evilJson = await body(evil);
  assert(
    "F1",
    "a foreign-origin mutation is rejected 403 CSRF_REJECTED",
    evil.status === 403 && evilJson?.error?.code === "CSRF_REJECTED",
    `status=${evil.status} code=${evilJson?.error?.code ?? "-"}`,
  );

  const same = await fetch(`${APP_URL}/api/bookmarks`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `${COOKIE}=${session}`, origin: APP_URL },
    body: JSON.stringify({ label: "csrf-probe" }),
    redirect: "manual",
  });
  const sameJson = await body(same);
  assert(
    "F2",
    "a legitimate same-origin mutation is NOT CSRF-rejected",
    sameJson?.error?.code !== "CSRF_REJECTED",
    `status=${same.status} code=${sameJson?.error?.code ?? "-"}`,
  );
}

// ─── 10. upload / STOW-RS into the private PACS ─────────────────────────────
async function checkUpload() {
  const sample = path.join(REPO, "dicom-samples", "CT001_001.dcm");
  if (SKIP_UPLOAD) return record("U1", "DICOM upload / STOW into private Orthanc", "SKIP", "--skip-upload");
  if (!existsSync(sample)) return record("U1", "DICOM upload / STOW into private Orthanc", "SKIP", "no dicom-samples/ in this checkout");

  const bytes = readFileSync(sample);
  const form = new FormData();
  form.append("files", new Blob([bytes], { type: "application/dicom" }), "CT001_001.dcm");

  const res = await req("/api/orthanc/upload", { method: "POST", body: form });
  const json = await body(res);
  const ok = res.status === 200 && json?.ok === true && (json?.success ?? 0) >= 1;
  assert("U1", "an authenticated DICOM upload reaches Orthanc", ok, `status=${res.status} success=${json?.success ?? 0}`);

  if (ok) {
    const qido = await req("/api/orthanc/dicom-web/studies?limit=5");
    // Consume the body exactly once — a Response cannot be read twice.
    const parsed = await body(qido);
    const list = Array.isArray(parsed) ? parsed : [];
    if (!studyUid) studyUid = list[0]?.["0020000D"]?.Value?.[0] ?? "";
    assert("U2", "the uploaded study is queryable via DICOMweb", qido.status === 200 && list.length > 0, `studies=${list.length}`);
  }
}

// ─── 11. logout ─────────────────────────────────────────────────────────────
async function checkLogout() {
  const res = await req("/api/auth/logout");
  const redirected = [301, 302, 303, 307, 308].includes(res.status);
  assert("X1", "logout redirects", redirected || res.status === 200, `status=${res.status}`);
  const loc = res.headers.get("location") ?? "";
  if (loc) assert("X2", "logout redirects to the public origin, never 0.0.0.0", !loc.includes("0.0.0.0"), `location=${loc}`);

  const cleared = (res.headers.getSetCookie?.() ?? []).some((c) => c.startsWith(`${COOKIE}=`) && /Expires=Thu, 01 Jan 1970|Max-Age=0/i.test(c));
  assert("X3", "logout clears the session cookie", cleared, "expiry cookie set");

  session = "";
  const after = await req("/api/worklist");
  assert("X4", "the session no longer authorises API access after logout", after.status === 401, `status=${after.status}`);
}

// ─── runner ─────────────────────────────────────────────────────────────────
const stages = [
  ["health", checkHealth],
  ["unauthenticated", checkUnauthenticated],
  ["login", checkLogin],
  ["integrations", checkIntegrations],
  ["client-config", checkClientConfig],
  ["clinical", checkClinical],
  ["dicomweb", checkDicomWeb],
  ["viewer", checkViewer],
  ["csrf", checkCsrf],
  ["upload", checkUpload],
  ["logout", checkLogout],
];

console.log(`\nVerifying deployment at ${APP_URL}\n`);

let aborted = false;
for (const [name, fn] of stages) {
  try {
    const out = await fn();
    // Stages that need a session are skipped until login has succeeded.
    if (name === "login" && out === false) {
      console.log("\nLogin unavailable — remaining authenticated checks cannot run.\n");
      aborted = true;
      break;
    }
  } catch (error) {
    if (error.message === "unreachable") {
      console.log(`\nThe deployment at ${APP_URL} is not reachable.`);
      console.log("Render free/paid services can take 1-2 minutes to boot after a deploy,");
      console.log("and a cold instance must finish migrations first. Retry shortly.\n");
      aborted = true;
      break;
    }
    record("ERR", `${name} stage`, false, `${error.name}: ${error.message}`);
  }
}

const pass = results.filter((r) => r.verdict === "PASS").length;
const fail = results.filter((r) => r.verdict === "FAIL").length;
const warn = results.filter((r) => r.verdict === "WARN").length;
const skip = results.filter((r) => r.verdict === "SKIP").length;

console.log(`${pass} passed, ${fail} failed, ${warn} warnings, ${skip} skipped (of ${results.length} checks)`);
if (aborted) console.log("Run aborted early — the deployment was not fully verified.");
console.log();

process.exit(fail > 0 || aborted || (STRICT && warn > 0) ? 1 : 0);
