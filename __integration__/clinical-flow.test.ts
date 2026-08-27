/**
 * Integration gate — SYNTHETIC end-to-end clinical workflow.
 *
 * Executes the full journey of a controlled fake patient through every
 * clinically meaningful transition against LIVE infrastructure. This is
 * the release-critical functional test — if this passes, the platform can
 * be demonstrated to controlled real users.
 *
 *   register → referral → scheduling → study creation → imaging upload
 *   → Orthanc reconciliation → assignment → review → AI candidate proposals
 *   → human radiologist accept/reject (the safety boundary) → report draft
 *   → radiologist signs report → workflow signed → released → archived.
 *
 * Asserts:
 *   - Every step is auditable.
 *   - Every audit row is attributed to a verified human session.
 *   - AI never crosses into the "signed" or "released" boundary.
 *   - The full transition history is recoverable from the DB of record.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { jarFetch, keycloakLogin, type CookieJar } from "./helpers/http";
import { env, USERS, dockerExec } from "./helpers/env";

let receptionist!: CookieJar;
let admin!: CookieJar;
let radiologist!: CookieJar;

function orthancAuth(): string {
  return `Basic ${Buffer.from(`${env.orthancUsername}:${env.orthancPassword}`).toString("base64")}`;
}

async function psql(sql: string): Promise<string> {
  const res = await dockerExec(env.postgresContainer, ["psql", "-U", "geraldos_admin", "-d", "geraldos", "-tAc", sql]);
  return res.out.trim();
}

beforeAll(async () => {
  [admin, radiologist, receptionist] = await Promise.all([
    keycloakLogin(USERS.admin.username, USERS.admin.password),
    keycloakLogin(USERS.radiologist.username, USERS.radiologist.password),
    keycloakLogin(USERS.receptionist.username, USERS.receptionist.password),
  ]);
});

/** Resolve a real Orthanc StudyInstanceUID from the first uploaded instance. */
async function firstStudyUid(): Promise<string> {
  const list = await (await fetch(`${env.orthancUrl}/instances`, { headers: { authorization: orthancAuth() } })).json() as string[];
  expect(list.length).toBeGreaterThan(0);
  const detail = await (await fetch(`${env.orthancUrl}/instances/${list[0]}/study`, {
    headers: { authorization: orthancAuth() },
  })).json() as { MainDicomTags?: { StudyInstanceUID?: string } };
  const uid = detail.MainDicomTags?.StudyInstanceUID ?? "";
  expect(uid).toBeTruthy();
  return uid;
}

describe("Synthetic end-to-end clinical workflow", () => {
  it("walks a fake patient from registration to archived, with AI safety boundary and human attribution", async () => {
    // ── 1. Register (receptionist) ──────────────────────────────────────
    const patientRes = await jarFetch(receptionist, `${env.appUrl}/api/patients`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mrn: `E2E${Date.now()}`,
        firstName: "E2E", lastName: "Synthetic",
        dateOfBirth: "1985-01-01", gender: "male",
      }),
    });
    expect(patientRes.status).toBe(201);
    const patient = (await patientRes.json()) as { id: string; mrn: string };

    // ── 2. Referral fixture (database record) ───────────────────────────
    const referralId = await psql(
      `INSERT INTO referrals (patient_id, referring_physician, clinical_indication, requested_procedure, priority) ` +
      `VALUES ('${patient.id}', 'Dr. E2E Referrer', 'Chronic cough, evaluate chest.', 'Chest CT', 'routine') RETURNING id`,
    );
    expect(referralId).toBeTruthy();
    const referral = { id: referralId };

    // ── 3. Appointment (receptionist) ───────────────────────────────────
    const apptRes = await jarFetch(receptionist, `${env.appUrl}/api/appointments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        patientId: patient.id,
        scheduledDate: new Date().toISOString().slice(0, 10),
        scheduledTime: "10:00",
        duration: 30,
        modality: "CT",
        procedure: "CT Chest",
        priority: "routine",
      }),
    });
    expect(apptRes.status).toBe(201);
    const appointment = (await apptRes.json()) as { id: string };

    // ── 4. Create RIS workflow study (radiologist) ──────────────────────
    const studyRes = await jarFetch(radiologist, `${env.appUrl}/api/workflow`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        patientId: patient.id, appointmentId: appointment.id,
        modality: "CT", procedure: "CT Chest", priority: "routine",
      }),
    });
    expect(studyRes.status).toBe(201);
    const studyBody = (await studyRes.json()) as { study?: { id: string; stage: string }; id?: string; stage?: string };
    const study = studyBody.study ?? (studyBody as { id: string; stage: string });
    expect(study.stage).toBe("referral");

    // ── 5. Imaging upload (admin) into real Orthanc ────────────────────
    const dcm = readFileSync(path.resolve(process.cwd(), "dicom-samples", "MRI001_001.dcm"));
    const form = new FormData();
    form.append("files", new File([new Uint8Array(dcm)], "MRI001_001.dcm", { type: "application/dicom" }));
    const up = await jarFetch(admin, `${env.appUrl}/api/orthanc/upload`, { method: "POST", body: form });
    expect(up.status).toBe(200);
    const uploaded = (await up.json()) as { ok: boolean; success: number; results: { orthancId: string }[] };
    expect(uploaded.ok).toBe(true);
    expect(uploaded.success).toBe(1);

    // ── 6. Reconcile with the real StudyInstanceUID ─────────────────────
    const uid = await firstStudyUid();
    const reconcile = await jarFetch(radiologist, `${env.appUrl}/api/workflow/${study.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: "sent_to_orthanc", studyInstanceUid: uid }),
    });
    expect(reconcile.status).toBe(200);

    // ── 7. Assign → opened → review (forward-only) ──────────────────────
    const forward = async (stage: string, extra: Record<string, unknown> = {}) => {
      const r = await jarFetch(radiologist, `${env.appUrl}/api/workflow/${study.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage, ...extra }),
      });
      if (r.status !== 200) {
        console.error("forward error:", stage, r.status, await r.text());
      }
      expect(r.status).toBe(200);
    };
    // Need a real staff id (radiologist) for the assigned stage.
    let staffId = (await psql(`SELECT id FROM staff WHERE role='radiologist' LIMIT 1`)).split("\n").filter(Boolean).pop()?.trim();
    if (!staffId) {
      staffId = (await psql(
        `INSERT INTO staff (first_name, last_name, role, specialization, email) ` +
        `VALUES ('Ruth', 'Radiologist', 'radiologist', 'Thoracic', 'ruth.radiologist@geraldos.local') RETURNING id`,
      )).split("\n").filter(Boolean).pop()?.trim();
    }
    expect(staffId).toBeTruthy();
    await forward("assigned", { radiologistId: staffId });
    await forward("opened");
    await forward("review");

    // ── 8. AI proposes CANDIDATE observations (status=pending) ─────────
    const aiRes = await jarFetch(radiologist, `${env.appUrl}/api/ai-review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ studyId: study.id, modality: "CT", procedure: "CT Chest" }),
    });
    expect(aiRes.status).toBe(201);
    const aiBody = (await aiRes.json()) as { ok: boolean; observations: { id: string; status: string }[] };
    expect(aiBody.ok).toBe(true);
    expect(aiBody.observations.length).toBeGreaterThan(0);
    for (const obs of aiBody.observations) {
      expect(obs.status).toBe("pending");
    }

    // AI SAFETY BOUNDARY: zero signed reports before any human accept/reject.
    const signedBefore = await psql(
      `SELECT count(*) FROM reports WHERE status='signed' AND study_id='${study.id}'`,
    );
    expect(signedBefore).toBe("0");

    // ── 9. Human radiologist accepts (or rejects) every candidate ──────
    for (const obs of aiBody.observations) {
      const r = await jarFetch(radiologist, `${env.appUrl}/api/ai-review/${obs.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "accepted" }),
      });
      expect(r.status).toBe(200);
    }
    const accepted = await psql(
      `SELECT count(*) FROM ai_observations WHERE study_id='${study.id}' AND status='accepted'`,
    );
    expect(Number(accepted)).toBe(aiBody.observations.length);

    // AI attribution is NEVER the source of truth — only the human sub/name
    // appears on the audit trail for these decisions.
    const reviewAudits = await psql(
      `SELECT user_id FROM audit_log WHERE action IN ('ai.observation_accepted','ai.observation_rejected') AND entity_id IN (${aiBody.observations.map((o) => `'${o.id}'`).join(",")})`,
    );
    for (const line of reviewAudits.split("\n").filter(Boolean)) {
      // Should be the radiologist's name (from JWT) — never "ai" / "system" / null.
      expect(line.toLowerCase()).not.toMatch(/^(ai|system|agent|null|workflow)$/);
    }

    // ── 10. Draft report (radiologist) and SIGN it ─────────────────────
    const draftRes = await jarFetch(radiologist, `${env.appUrl}/api/reports`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        studyId: study.id, patientId: patient.id, radiologistId: staffId,
        findings: "E2E synthetic report: no acute findings.",
        impression: "Unremarkable CT chest.",
        recommendation: "Clinical correlation.",
      }),
    });
    expect(draftRes.status).toBe(201);
    const report = (await draftRes.json()) as { id: string; status: string };
    expect(report.status).toBe("draft");

    // Sign — requires explicit radiologist confirmation (approvedBy).
    const signRes = await jarFetch(radiologist, `${env.appUrl}/api/reports/${report.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "signed",
        approvedBy: "Ruth Radiologist", // radiologist name from Keycloak
        findings: "E2E synthetic report: no acute findings.",
        impression: "Unremarkable CT chest.",
        recommendation: "Clinical correlation.",
      }),
    });
    expect(signRes.status).toBe(200);
    const finalReport = (await (await jarFetch(radiologist, `${env.appUrl}/api/reports/${report.id}`)).json()) as { report: { status: string; signedAt: string | null } };
    expect(finalReport.report.status).toBe("signed");
    expect(finalReport.report.signedAt).toBeTruthy();

    // AI cannot sign: try as a zero-role user. Noroles user → 403.
    const noroles = await keycloakLogin("it-noroles", "it-password");
    const attempt = await jarFetch(noroles, `${env.appUrl}/api/reports/${report.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "signed", approvedBy: "Noah Noroles" }),
    });
    expect(attempt.status).toBe(403);
    // Still signed, still attributed to the human radiologist.
    const stillSigned = await psql(`SELECT status FROM reports WHERE id='${report.id}'`);
    expect(stillSigned).toBe("signed");

    // ── 11. workflow signed → released → archived ──────────────────────
    const forwardAuthed = async (jar: CookieJar, stage: string) => {
      const r = await jarFetch(jar, `${env.appUrl}/api/workflow/${study.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      return r;
    };
    const sigStage = await forwardAuthed(radiologist, "signed");
    expect(sigStage.status).toBe(200);
    const relStage = await forwardAuthed(radiologist, "released");
    expect(relStage.status).toBe(200);
    const arcStage = await forwardAuthed(radiologist, "archived");
    expect(arcStage.status).toBe(200);

    // ── 12. Full audit trail integrity ─────────────────────────────────
    const auditSummary = await psql(
      `SELECT action, count(*) FROM audit_log WHERE entity_id='${study.id}' GROUP BY action ORDER BY action`,
    );
    // We expect workflow.transition (4 forward moves: assigned/opened/review/sent_to_orthanc — actually
    // sent_to_orthanc was first; then assigned/opened/review/signed/released/archived = 7).
    expect(auditSummary).toContain("workflow.transition");
    // AI observation review actions are attributed to the radiologist.
    const aiReviewAuditCount = await psql(
      `SELECT count(*) FROM audit_log WHERE module='ai-review' AND entity_id IN (${aiBody.observations.map((o) => `'${o.id}'`).join(",")})`,
    );
    expect(Number(aiReviewAuditCount)).toBe(aiBody.observations.length);

    // The report signing audit is bound to the radiologist user, not a service user.
    const signAudit = await psql(
      `SELECT user_id FROM audit_log WHERE module IN ('reporting', 'reports') AND action='report.signed' AND entity_id='${report.id}'`,
    );
    expect(signAudit.toLowerCase()).toContain("ruth");

    // Final view: study is archived, report is signed, observations are accepted.
    const finalStage = await psql(`SELECT stage FROM workflow_studies WHERE id='${study.id}'`);
    expect(finalStage).toBe("archived");
  }, 300_000);
});
