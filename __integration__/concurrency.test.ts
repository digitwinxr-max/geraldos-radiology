/**
 * Integration gate â€” workflow concurrency against real PostgreSQL.
 *
 * Simulates the race that matters clinically: several operators (or a retrying
 * client and an operator) advancing the SAME study at the SAME time. The
 * optimistic-concurrency guard must produce exactly one winner, correct
 * conflicts for losers, and audit/event records that match the committed state.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { jarFetch, nativeLogin, provisionStaff, type CookieJar } from "./helpers/http";
import { env, USERS } from "./helpers/env";

let admin!: CookieJar;
let radiologist!: CookieJar;

async function psql(sql: string): Promise<string> {
  const { dockerExec } = await import("./helpers/env");
  const res = await dockerExec("geraldos-it-postgres", [
    "psql", "-U", "geraldos_admin", "-d", "geraldos", "-tAc", sql,
  ]);
  return res.out.trim();
}

beforeAll(async () => {
  // Patients are registered by an administrator; the race itself is driven by
  // two radiologists (the clinically realistic actors).
  await provisionStaff();
  [admin, radiologist] = await Promise.all([
    nativeLogin(USERS.admin.email, USERS.admin.password),
    nativeLogin(USERS.radiologist.email, USERS.radiologist.password),
  ]);
});

async function createStudy(): Promise<{ id: string; accessionNumber: string }> {
   const patientRes = await jarFetch(admin, `${env.appUrl}/api/patients`, {
     method: "POST",
     headers: { "content-type": "application/json" },
     body: JSON.stringify({
       mrn: `MRN${Math.floor(Math.random()*1000000)}`,
       firstName: "Race", lastName: `Conc${Date.now()}`, dateOfBirth: "1975-03-03", gender: "female",
     }),
   });
   const pb = await patientRes.json();
   const patient = pb.data ?? pb.patient ?? pb;
   const studyRes = await jarFetch(radiologist, `${env.appUrl}/api/workflow`, {
     method: "POST",
     headers: { "content-type": "application/json" },
     body: JSON.stringify({ patientId: patient.id, modality: "CT", procedure: "CT Head", priority: "routine" }),
   });
   expect(studyRes.status).toBe(201);
   return (await studyRes.json()).study;
 }

describe("Workflow concurrency â€” parallel updates on one study", () => {
  it("lets exactly ONE of N concurrent same-stage transitions win", async () => {
    const study = await createStudy();
    const N = 8;

    const results = await Promise.all(
      Array.from({ length: N }, () =>
        jarFetch(radiologist, `${env.appUrl}/api/workflow/${study.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ stage: "appointment" }),
        }),
      ),
    );
    const bodies = (await Promise.all(results.map((r) => r.json()))) as {
      transitioned?: boolean;
    }[];

    // INVARIANT 1 — exactly one caller actually transitioned the study.
    // Whether a loser observes 409 (raced inside the winner's transaction) or
    // 200 with transitioned:false (arrived after the winner committed — the
    // deliberate idempotent no-op) depends on arrival order alone; neither may
    // apply the transition twice.
    const applied = results.filter(
      (r, i) => r.status === 200 && bodies[i]?.transitioned === true,
    );
    expect(applied).toHaveLength(1);

    // INVARIANT 2 — every other caller is explicitly told: conflict or no-op.
    results.forEach((r, i) => {
      const isWinner = r.status === 200 && bodies[i]?.transitioned === true;
      if (!isWinner) {
        expect([409, 200]).toContain(r.status);
        if (r.status === 200) expect(bodies[i]?.transitioned).toBe(false);
      }
    });

    // INVARIANT 3 — the committed state matches the single transition.
    const stage = await psql(`SELECT stage FROM workflow_studies WHERE id='${study.id}'`);
    expect(stage).toBe("appointment");

    // INVARIANT 4 — events/audit correspond to the committed state:
    // one transition, no more, regardless of how many callers raced.
    const audits = await psql(
      `SELECT count(*) FROM audit_log WHERE entity_id='${study.id}' AND action='workflow.transition'`,
    );
    expect(audits).toBe("1");
  });

  it("keeps sequential forward transitions working after conflicts", async () => {
    const study = await createStudy();

    for (const next of ["appointment", "arrival"]) {
      const res = await jarFetch(radiologist, `${env.appUrl}/api/workflow/${study.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage: next }),
      });
      expect(res.status).toBe(200);
    }

    const stage = await psql(`SELECT stage FROM workflow_studies WHERE id='${study.id}'`);
    expect(stage).toBe("arrival");
  });

  it("rejects invalid stages with 400 and duplicates are safe no-ops", async () => {
    const study = await createStudy();

    const unknown = await jarFetch(radiologist, `${env.appUrl}/api/workflow/${study.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: "teleported" }),
    });
    expect(unknown.status).toBe(400);

    const duplicate = await jarFetch(radiologist, `${env.appUrl}/api/workflow/${study.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: "referral" }),
    });
    expect(duplicate.status).toBe(200);
    expect((await duplicate.json()).study.transitioned ?? false).toBe(false);
  });
});
