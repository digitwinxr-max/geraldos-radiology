#!/usr/bin/env node
/**
 * GeraldOS — end-to-end deployment verification.
 *
 * Exercises the REAL deployed topology over HTTP (no mocks):
 *
 *   browser → app edge proxy (/viewer mount) → OHIF
 *           → app DICOMweb proxy (/api/orthanc/dicom-web) → Orthanc
 *
 * Usage:
 *   APP_URL=http://localhost:3000 ADMIN_EMAIL=... ADMIN_PASSWORD=... \
 *     node scripts/e2e-imaging-check.mjs
 *
 * Exits non-zero on any failure. Never prints secrets or session tokens.
 * DICOM upload uses the sample study checked into the repo
 * (dicom-samples/CT001_001.dcm).
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const APP_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SAMPLE = join(dirname(fileURLToPath(import.meta.url)), "..", "dicom-samples", "CT001_001.dcm");

let pass = 0;
let fail = 0;
function record(id, label, ok, detail = "") {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${id}  ${label}${detail ? ` — ${detail}` : ""}`);
}

let cookie = "";

function setCookie(res) {
  const set = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const c of set) {
    const [pair] = c.split(";");
    const [name] = pair.split("=");
    if (name === "geraldos_session") {
      if (/Expires=Thu, 01 Jan 1970|Max-Age=0/i.test(c)) cookie = "";
      else cookie = pair;
    }
  }
}

async function req(path, init = {}, { auth = true } = {}) {
  const headers = { ...(init.headers ?? {}) };
  if (auth && cookie) headers.cookie = cookie;
  headers.origin = APP_URL;
  return fetch(`${APP_URL}${path}`, { redirect: "manual", ...init, headers });
}

// ─── 1. health ───────────────────────────────────────────────────────────────
async function checkHealth() {
  const res = await fetch(`${APP_URL}/api/health`);
  const json = await res.json().catch(() => ({}));
  record("H1", "/api/health returns 200", res.status === 200, `status=${res.status}`);
  record("H2", "database probe healthy", json?.db?.ok === true, `db=${JSON.stringify(json?.db)}`);
}

// ─── 2. fail-closed unauthenticated access ───────────────────────────────────
async function checkUnauthenticated() {
  const viewer = await fetch(`${APP_URL}/viewer`, { redirect: "manual" });
  record("A1", "unauthenticated /viewer is redirected to login", [301, 302, 303, 307, 308].includes(viewer.status), `status=${viewer.status}`);
  const qido = await fetch(`${APP_URL}/api/orthanc/dicom-web/studies`);
  record("A2", "unauthenticated DICOMweb is rejected", qido.status === 401, `status=${qido.status}`);
}

// ─── 3. login ────────────────────────────────────────────────────────────────
async function checkLogin() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    record("L0", "ADMIN_EMAIL/ADMIN_PASSWORD not set — authenticated checks skipped", false);
    return false;
  }
  const res = await req("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  }, { auth: false });
  setCookie(res);
  record("L1", "login succeeds", res.status === 200 && Boolean(cookie), `status=${res.status}`);
  const me = await req("/api/auth/me");
  const meJson = await me.json().catch(() => ({}));
  const meUser = meJson?.user ?? meJson;
  record("L2", "session identity is the administrator", me.status === 200 && Array.isArray(meUser?.roles) && meUser.roles.includes("administrator"), `status=${me.status} roles=${JSON.stringify(meUser?.roles)}`);
  return Boolean(cookie);
}

// ─── 4. integrations ─────────────────────────────────────────────────────────
async function checkIntegrations() {
  const res = await req("/api/integrations/status");
  const json = await res.json().catch(() => ({ integrations: [] }));
  const list = Array.isArray(json?.integrations) ? json.integrations : [];
  const orthanc = list.find((i) => i.key === "orthanc" || i.name === "orthanc");
  const ohif = list.find((i) => i.key === "ohif" || i.name === "ohif");
  const diag = orthanc || ohif ? "" : ` payload=${JSON.stringify(json).slice(0, 200)} keys=${list.map((i) => i.key).join(",")}`;
  record("I1", "Orthanc reachable from inside the private network", orthanc?.status === "connected", `status=${orthanc?.status} ${orthanc?.detail ?? ""}${diag}`);
  record("I2", "OHIF reachable from inside the private network", ohif?.status === "connected", `status=${ohif?.status} ${ohif?.detail ?? ""}${diag}`);
  const payload = JSON.stringify(json);
  record("I3", "integrations payload leaks no internal Orthanc URL", !payload.includes("orthanc:8042") && !payload.includes("geraldos-orthanc"), "");
}

// ─── 5. same-origin viewer mount ─────────────────────────────────────────────
async function checkViewerMount() {
  const index = await req("/viewer/");
  const html = await index.text();
  record("V1", "/viewer/ serves the OHIF shell (same origin)", index.status === 200 && html.includes("OHIF Viewer"), `status=${index.status}`);
  const cfg = await req("/app-config.js");
  const cfgBody = await cfg.text();
  record("V2", "OHIF runtime config served with routerBasename /viewer", cfg.status === 200 && cfgBody.includes("routerBasename: '/viewer'"), `status=${cfg.status}`);
  const bundle = html.match(/\/app\.bundle\.[0-9a-f]+\.js/)?.[0];
  record("V3", "index.html references the app bundle", Boolean(bundle), bundle ?? "");
  if (bundle) {
    const res = await req(bundle);
    record("V4", "app bundle loads through the edge proxy", res.status === 200, `status=${res.status}`);
  }
  const sw = await req("/init-service-worker.js");
  record("V5", "service-worker registration blocked", sw.status === 404, `status=${sw.status}`);
  const deepLink = await req("/viewer/viewer?StudyInstanceUIDs=1.2.3.4");
  record("V6", "viewer deep-link route serves the shell", deepLink.status === 200, `status=${deepLink.status}`);
}

// ─── 6. clinical data ────────────────────────────────────────────────────────
async function checkClinical() {
  const worklist = await req("/api/worklist");
  record("W1", "authenticated worklist served", worklist.status === 200, `status=${worklist.status}`);
  const patients = await req("/api/patients");
  record("W2", "authenticated patients API served", patients.status === 200, `status=${patients.status}`);
}

// ─── 7. DICOM upload + DICOMweb (the imaging path) ──────────────────────────
async function checkImaging() {
  // dicom-samples/ is excluded from the production image (see .dockerignore),
  // so on a Render Shell run the sample is not available — skip the upload
  // chain gracefully rather than aborting the harness.
  if (!existsSync(SAMPLE)) {
    console.log(`SKIP  imaging (U*) checks — sample DICOM not present (${SAMPLE})`);
    return;
  }
  const dicom = readFileSync(SAMPLE);
  const form = new FormData();
  form.append("files", new File([dicom], "CT001_001.dcm", { type: "application/dicom" }));
  const up = await req("/api/orthanc/upload", { method: "POST", body: form });
  const upJson = await up.json().catch(() => ({}));
  record("U1", "authenticated DICOM upload reaches Orthanc", up.status === 200 && upJson?.ok === true && (upJson?.success ?? 0) >= 1, `status=${up.status} success=${upJson?.success ?? 0}`);

  const qido = await req("/api/orthanc/dicom-web/studies?limit=10");
  const studies = await qido.json().catch(() => []);
  record("U2", "QIDO-RS study query through the proxy", qido.status === 200 && Array.isArray(studies) && studies.length > 0, `status=${qido.status} studies=${Array.isArray(studies) ? studies.length : "n/a"}`);
  const uid = Array.isArray(studies) ? studies[0]?.["0020000D"]?.Value?.[0] : null;
  if (!uid) return;

  const series = await req(`/api/orthanc/dicom-web/studies/${uid}/series`);
  const seriesList = await series.json().catch(() => []);
  record("U3", "QIDO-RS series query (viewer worklist path)", series.status === 200 && Array.isArray(seriesList) && seriesList.length > 0, `status=${series.status}`);
  const seriesUid = Array.isArray(seriesList) ? seriesList[0]?.["0020000E"]?.Value?.[0] : null;
  if (!seriesUid) return;

  const instances = await req(`/api/orthanc/dicom-web/studies/${uid}/series/${seriesUid}/instances`);
  const instanceList = await instances.json().catch(() => []);
  record("U4", "QIDO-RS instances query", instances.status === 200 && Array.isArray(instanceList) && instanceList.length > 0, `status=${instances.status}`);
  const sop = Array.isArray(instanceList) ? instanceList[0]?.["00080018"]?.Value?.[0] : null;
  if (!sop) return;

  const wado = await req(`/api/orthanc/dicom-web/studies/${uid}/series/${seriesUid}/instances/${sop}`);
  const buf = await wado.arrayBuffer();
  record("U5", "WADO-RS instance retrieval (pixels path)", wado.status === 200 && buf.byteLength > 100, `status=${wado.status} bytes=${buf.byteLength}`);
}

// ─── 8. logout ───────────────────────────────────────────────────────────────
async function checkLogout() {
  const out = await req("/api/auth/logout");
  setCookie(out);
  record("X1", "logout succeeds", [200, 301, 302, 303, 307, 308].includes(out.status), `status=${out.status}`);
  const after = await req("/api/worklist");
  record("X2", "session no longer authorises API access after logout", after.status === 401, `status=${after.status}`);
}

// ─── runner ──────────────────────────────────────────────────────────────────
console.log(`\nGeraldOS E2E verification — ${APP_URL}\n`);
let reachable = true;
try {
  await checkHealth();
  await checkUnauthenticated();
  const loggedIn = await checkLogin();
  if (loggedIn) {
    await checkIntegrations();
    await checkViewerMount();
    await checkClinical();
    await checkImaging();
    await checkLogout();
  }
} catch (error) {
  reachable = false;
  console.error(`ABORTED: ${error?.name}: ${error?.message}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
if (!reachable) console.log("The deployment was not fully verified.");
process.exit(fail > 0 || !reachable ? 1 : 0);
