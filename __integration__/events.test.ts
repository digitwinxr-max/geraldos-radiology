/**
 * Integration gate — event reliability against live PostgreSQL (the event bus).
 *
 * Proves the PostgreSQL-native contract end to end:
 *   publish → durable row with correlation id → ordered reads via the API.
 *   No secondary fan-out store exists; event_log is the record of truth.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { jarFetch, nativeLogin, provisionStaff, type CookieJar } from "./helpers/http";
import { env, USERS, dockerExec } from "./helpers/env";

let admin!: CookieJar;

async function psql(sql: string): Promise<string> {
  const res = await dockerExec(env.postgresContainer, [
    "psql", "-U", "geraldos_admin", "-d", "geraldos", "-tAc", sql,
  ]);
  return res.out.trim();
}

function poll<T>(fn: () => Promise<T | null>, timeoutMs: number, intervalMs = 500): Promise<T> {
  return new Promise(async (resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const result = await fn();
        if (result !== null) return resolve(result);
      } catch (e) {
        /* keep polling */
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    reject(new Error("poll timed out"));
  });
}

beforeAll(async () => {
  await provisionStaff();
  admin = await nativeLogin(USERS.admin.email, USERS.admin.password);
});

describe("Event bus — database event → durable record → ordered reads", () => {
  it("persists the event durably with a correlation id and makes it visible through the API", async () => {
    const res = await jarFetch(admin, `${env.appUrl}/api/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "custom.integration.probe",
        aggregate: "integration",
        aggregateId: `probe-${Date.now()}`,
        payload: { hello: "geraldos" },
      }),
    });
    expect(res.status).toBe(200);

    // The durable record exists with a request-scoped correlation id...
    const row = await poll(async () => {
      const out = await psql(
        `SELECT id || '|' || COALESCE(correlation_id,'none')
         FROM event_log WHERE event_type='custom.integration.probe' ORDER BY id DESC LIMIT 1`,
      );
      return out.includes("|") ? out : null;
    }, 15_000);
    expect(row.split("|")[1]).not.toBe("none");

    // ...and the event listing API surfaces it in insertion order.
    const listed = await jarFetch(admin, `${env.appUrl}/api/events?type=custom.integration.probe`);
    expect(listed.status).toBe(200);
    const body = await listed.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0].eventType).toBe("custom.integration.probe");
  });

  it("returns events newest-first with correct counts and type filtering", async () => {
    const marker = `custom.integration.order.${Date.now()}`;
    await jarFetch(admin, `${env.appUrl}/api/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: marker, aggregate: "integration", aggregateId: "a", payload: {} }),
    });
    await jarFetch(admin, `${env.appUrl}/api/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: marker, aggregate: "integration", aggregateId: "b", payload: {} }),
    });

    const listed = await jarFetch(admin, `${env.appUrl}/api/events?type=${encodeURIComponent(marker)}`);
    const body = await listed.json();
    expect(body.data.length).toBe(2);
    expect(body.meta.total).toBe(2);
    const ids = body.data.map((e: { aggregateId: string }) => e.aggregateId);
    expect(ids).toEqual(["b", "a"]);
  });
});
