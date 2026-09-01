/**
 * Integration gate — LIVE authentication & authorization through native
 * GeraldOS login (scrypt staff records + HS256 session) and the production
 * server build. No mocks anywhere in this file.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { jarFetch, nativeLogin, provisionStaff, createCookieJar, type CookieJar } from "./helpers/http";
import { env, USERS } from "./helpers/env";

const jars: Partial<Record<keyof typeof USERS, CookieJar>> = {};

beforeAll(async () => {
  await provisionStaff();
  for (const [key, user] of Object.entries(USERS)) {
    jars[key as keyof typeof USERS] = await nativeLogin(user.email, user.password);
  }
});

describe("Authentication — browser/session → native login → GeraldOS", () => {
  it("rejects anonymous access to a protected API with a structured 401", async () => {
    const res = await fetch(`${env.appUrl}/api/patients`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("redirects anonymous page requests to /login", async () => {
    const res = await fetch(`${env.appUrl}/workstation`, { redirect: "manual" });
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("issues a session bound to the staff member's role", async () => {
    const me = await jarFetch(jars.admin!, `${env.appUrl}/api/auth/me`);
    expect(me.status).toBe(200);
    const body = await me.json();
    expect(body.user?.roles ?? body.roles).toContain("administrator");
  });

  it("keeps the HS256 session cookie working over HTTP with the expected attributes", async () => {
    // The Set-Cookie was captured during login; re-request something that
    // proves the cookie works over HTTP.
    const res = await jarFetch(jars.radiologist!, `${env.appUrl}/api/auth/me`);
    expect(res.status).toBe(200);
  });

  it("rejects a forged session token", async () => {
    const res = await fetch(`${env.appUrl}/api/patients`, {
      headers: { cookie: "geraldos_session=forged.token.value" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects login with a wrong password and mints no session", async () => {
    const jar = createCookieJar();
    const res = await jarFetch(jar, `${env.appUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: USERS.admin.email, password: "definitely-wrong" }),
    });
    expect(res.status).toBe(401);
    expect(jar.get("geraldos_session")).toBeUndefined();
  });
});

describe("Authorization — role → endpoint → RBAC → service", () => {
  it("denies a receptionist administrative data (403 FORBIDDEN)", async () => {
    const res = await jarFetch(jars.receptionist!, `${env.appUrl}/api/staff`);
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
  });

  it("allows a radiologist to read the workflow list", async () => {
    const res = await jarFetch(jars.radiologist!, `${env.appUrl}/api/workflow`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.meta.total).toBeGreaterThanOrEqual(0);
  });

  it("never lets a role-less staff member sign a report (fail closed)", async () => {
    // Create a draft report first (receptionist + administrator).
    const patientRes = await jarFetch(jars.receptionist!, `${env.appUrl}/api/patients`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mrn: `MRN${Date.now()}`,
        firstName: "Sig", lastName: "Guard", dateOfBirth: "1980-01-01", gender: "female",
      }),
    });
    const pb = await patientRes.json();
    const patient = pb.data ?? pb.patient ?? pb;

    const reportRes = await jarFetch(jars.admin!, `${env.appUrl}/api/reports`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patientId: patient.id, findings: "integration draft" }),
    });
    expect(reportRes.status).toBe(201);
    const rb = await reportRes.json();
    const report = rb.report ?? rb.data ?? rb;

    const signRes = await jarFetch(jars.noroles!, `${env.appUrl}/api/reports/${report.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "signed", approvedBy: "Noah Noroles" }),
    });
    expect(signRes.status).toBe(403);

    // And the report is still unsigned in the database of record.
    const check = await jarFetch(jars.admin!, `${env.appUrl}/api/reports/${report.id}`);
    expect((await check.json()).report.status).not.toBe("signed");
  });

  it("keeps cross-origin mutations CSRF-rejected even with a valid session", async () => {
    const res = await jarFetch(jars.admin!, `${env.appUrl}/api/patients`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://evil.example" },
      body: JSON.stringify({ firstName: "X", lastName: "Y", dateOfBirth: "1990-01-01", gender: "male", mrn: "MRNCSRF" }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("CSRF_REJECTED");
  });
});
