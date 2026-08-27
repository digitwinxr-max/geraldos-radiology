/**
 * Integration gate — event reliability against live Redis + PostgreSQL.
 *
 * Proves the ADR-010 contract end to end:
 *   publish → durable row (pending) → relay XADD → publishedAt stamp
 *   ...and recovery when Redis dies and comes back.
 */

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { jarFetch, keycloakLogin, type CookieJar } from "./helpers/http";
import { env, USERS, dockerExec } from "./helpers/env";

async function loginAdmin(): Promise<CookieJar> {
  return keycloakLogin(USERS.admin.username, USERS.admin.password);
}

async function psql(sql: string): Promise<string> {
  const res = await dockerExec(env.postgresContainer, [
    "psql", "-U", "geraldos_admin", "-d", "geraldos", "-tAc", sql,
  ]);
  return res.out.trim();
}

async function redisXrangeLast(count = 5): Promise<string> {
  const res = await dockerExec(env.redisContainer, [
    "redis-cli", "--raw", "XRANGE", "geraldos:events", "-", "+", "COUNT", String(count),
  ]);
  return res.out;
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

describe("Event reliability — database event → publisher → Redis → consumer", () => {
  it("persists the event durably AND fans it out to the Redis stream with correlation data", async () => {
    const jar = await loginAdmin();

    const res = await jarFetch(jar, `${env.appUrl}/api/events`, {
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
        `SELECT id || '|' || COALESCE(correlation_id,'none') || '|' || COALESCE(published_at::text,'pending')
         FROM event_log WHERE event_type='custom.integration.probe' ORDER BY id DESC LIMIT 1`,
      );
      return out.includes("|") ? out : null;
    }, 15_000);
    expect(row.split("|")[1]).not.toBe("none");

    // ...and the relay stamped it published after fanning out to Redis.
    await poll(async () => {
      const state = await psql(
        `SELECT CASE WHEN published_at IS NULL THEN 'pending' ELSE 'published' END
         FROM event_log WHERE id=${row.split("|")[0]}`,
      );
      return state === "published" ? "published" : null;
    }, 20_000);

    const stream = await redisXrangeLast(10);
    expect(stream).toContain("custom.integration.probe");
  });

  it("survives Redis going down and drains the backlog after it returns", async () => {
    const jar = await loginAdmin();

    // Force a dependency failure.
    execFileSync("docker", ["stop", env.redisContainer], { timeout: 60_000 });

    let pendingId = "";
    try {
      // Publish while Redis is down — the durable record must still land.
      const res = await jarFetch(jar, `${env.appUrl}/api/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "custom.integration.outage",
          aggregate: "integration",
          aggregateId: `outage-${Date.now()}`,
          payload: {},
        }),
      });
      expect(res.status).toBe(200);

      pendingId = await poll(async () => {
        const out = await psql(
          `SELECT min(id)::text FROM event_log
           WHERE event_type='custom.integration.outage' AND published_at IS NULL`,
        );
        return out ? out : null;
      }, 20_000);
      expect(Number(pendingId)).toBeGreaterThan(0);
    } finally {
      // Restore the dependency.
      execFileSync("docker", ["start", env.redisContainer], { timeout: 60_000 });
    }

    // The self-healing relay must drain the pending backlog without an app restart.
    await poll(async () => {
      const state = await psql(
        `SELECT count(*) FROM event_log WHERE id=${pendingId} AND published_at IS NOT NULL`,
      );
      return state === "1" ? "drained" : null;
    }, 45_000);
  });
});
