/**
 * Gate — production admin bootstrap (scripts/lib/admin-bootstrap.mjs).
 *
 * Proves the security properties required for the first-administrator path:
 *   - scrypt hashing format matches native auth (scrypt$N$r$p$salt$key,
 *     16-byte salt, 64-byte key) and verifies with timing-safe comparison;
 *   - minimum password validation (12 chars) with fail-closed behaviour;
 *   - idempotent upsert (repeated runs refresh the SAME row — no duplicates);
 *   - administrator role + active status;
 *   - duplicate-email handling (case-insensitive, single row).
 */

import { describe, expect, it } from "vitest";

// Import the plain-ESM module directly (no TS build needed). Typed via the
// named-export shape below so tsc has declarations for the .mjs module.
const {
  SCRYPT_N,
  SCRYPT_R,
  SCRYPT_P,
  SCRYPT_KEY_LENGTH,
  SCRYPT_SALT_LENGTH,
  PASSWORD_MIN_LENGTH,
  hashPasswordScrypt,
  verifyPasswordScrypt,
  validateAdminCredentials,
  bootstrapAdmin,
} = require("../../scripts/lib/admin-bootstrap.mjs") as {
  SCRYPT_N: number;
  SCRYPT_R: number;
  SCRYPT_P: number;
  SCRYPT_KEY_LENGTH: number;
  SCRYPT_SALT_LENGTH: number;
  PASSWORD_MIN_LENGTH: number;
  hashPasswordScrypt: (password: string) => string;
  verifyPasswordScrypt: (password: string, stored: string) => boolean;
  validateAdminCredentials: (email: string, password: string) => string | null;
  bootstrapAdmin: (opts: Record<string, unknown>) => Promise<{
    id: string;
    email: string;
    role: string;
    status: string;
    created: boolean;
  }>;
};

function makeClient() {
  const calls: { sql: string; values: unknown[] }[] = [];
  const results: { rows: unknown[]; rowCount: number }[] = [];
  const client = {
    connect: async () => {},
    end: async () => {},
    query: async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      return results.shift() ?? { rows: [], rowCount: 0 };
    },
  };
  return {
    calls,
    setResult(r: { rows: unknown[]; rowCount: number }) {
      results.push(r);
    },
    client,
  };
}

function optsFor(client: unknown, email: string, password: string) {
  return { client, email, password } as never;
}

describe("scrypt password hashing (native-auth parity)", () => {
  it("produces the exact storage format scrypt$N$r$p$salt$key with 16-byte salt and 64-byte key", () => {
    const hash = hashPasswordScrypt("s3cure-admin-password");
    const parts = hash.split("$");
    expect(parts[0]).toBe("scrypt");
    expect(parts).toHaveLength(6);
    expect(Number(parts[1])).toBe(SCRYPT_N);
    expect(Number(parts[2])).toBe(SCRYPT_R);
    expect(Number(parts[3])).toBe(SCRYPT_P);
    expect(Buffer.from(parts[4], "hex").length).toBe(SCRYPT_SALT_LENGTH);
    expect(Buffer.from(parts[5], "hex").length).toBe(SCRYPT_KEY_LENGTH);
  });

  it("uses a random salt: two hashes of the same password differ", () => {
    const a = hashPasswordScrypt("s3cure-admin-password");
    const b = hashPasswordScrypt("s3cure-admin-password");
    expect(a).not.toBe(b);
  });

  it("verifies correct passwords and rejects wrong ones (timing-safe compare)", () => {
    const hash = hashPasswordScrypt("s3cure-admin-password");
    expect(verifyPasswordScrypt("s3cure-admin-password", hash)).toBe(true);
    expect(verifyPasswordScrypt("wrong-password", hash)).toBe(false);
    expect(verifyPasswordScrypt("s3cure-admin-password", "not-a-hash")).toBe(false);
    expect(verifyPasswordScrypt("s3cure-admin-password", "")).toBe(false);
  });
});

describe("minimum password validation", () => {
  it("rejects passwords shorter than the minimum", () => {
    expect(validateAdminCredentials("admin@gerald.co.bw", "short")).toBe(
      `ADMIN_PASSWORD must be at least ${PASSWORD_MIN_LENGTH} characters`,
    );
  });

  it("rejects missing/invalid emails", () => {
    expect(validateAdminCredentials("", "s3cure-admin-password")).toBe(
      "ADMIN_EMAIL must be a valid email address",
    );
    expect(validateAdminCredentials("not-an-email", "s3cure-admin-password")).toBe(
      "ADMIN_EMAIL must be a valid email address",
    );
  });

  it("accepts valid credentials", () => {
    expect(validateAdminCredentials("admin@gerald.co.bw", "s3cure-admin-password")).toBeNull();
  });
});

describe("bootstrap idempotency", () => {
  it("creates the administrator on first run with role administrator and status active", async () => {
    const mock = makeClient();
    mock.setResult({ rows: [], rowCount: 0 }); // no existing row
    mock.setResult({ rows: [{ id: "staff-1" }], rowCount: 1 }); // insert returns id

    const result = await bootstrapAdmin(optsFor(mock.client, "Admin@Gerald.co.bw", "s3cure-admin-password"));

    expect(result.created).toBe(true);
    expect(result.role).toBe("administrator");
    expect(result.status).toBe("active");
    expect(result.email).toBe("admin@gerald.co.bw");

    // SELECT for existing row, then INSERT (no UPDATE on first run).
    expect(mock.calls[0].sql).toMatch(/FROM staff WHERE lower\(email\)/i);
    expect(mock.calls[1].sql).toMatch(/^INSERT INTO staff/i);
    const insertValues = mock.calls[1].values;
    expect(insertValues).toContain("admin@gerald.co.bw");
    expect(insertValues).toContain("administrator");
    expect(insertValues).toContain("active");
  });

  it("refreshes the same row on rerun — never duplicates the administrator", async () => {
    const mock = makeClient();
    mock.setResult({ rows: [{ id: "staff-1", email: "admin@gerald.co.bw" }], rowCount: 1 });
    mock.setResult({ rows: [], rowCount: 1 }); // update affected 1 row

    const result = await bootstrapAdmin(optsFor(mock.client, "admin@gerald.co.bw", "another-s3cure-password"));

    expect(result.created).toBe(false);
    expect(result.id).toBe("staff-1");
    expect(result.role).toBe("administrator");
    expect(result.status).toBe("active");

    const insertCalls = mock.calls.filter((c) => c.sql.match(/^INSERT INTO staff/i));
    expect(insertCalls).toHaveLength(0);
    const update = mock.calls.find((c) => c.sql.match(/^UPDATE staff/i));
    expect(update).toBeDefined();
    expect(update!.values[update!.values.length - 1]).toBe("staff-1");
  });

  it("handles duplicate-email variants case-insensitively (single row)", async () => {
    const mock = makeClient();
    // Existing row stored with mixed case.
    mock.setResult({ rows: [{ id: "staff-1", email: "Admin@Gerald.co.bw" }], rowCount: 1 });
    mock.setResult({ rows: [], rowCount: 1 });

    await bootstrapAdmin(optsFor(mock.client, "admin@gerald.co.bw", "s3cure-admin-password"));

    expect(mock.calls[0].values[0]).toBe("admin@gerald.co.bw");
    const update = mock.calls.find((c) => c.sql.match(/^UPDATE staff/i));
    expect(update).toBeDefined();
    // Normalized email written back.
    expect(update!.values).toContain("admin@gerald.co.bw");
  });

  it("fails safely (throws) with missing/weak credentials before any database write", async () => {
    const mock = makeClient();
    await expect(
      bootstrapAdmin(optsFor(mock.client, "", "short")),
    ).rejects.toThrow(/ADMIN_(EMAIL|PASSWORD)/);
    await expect(
      bootstrapAdmin(optsFor(mock.client, "admin@gerald.co.bw", "short")),
    ).rejects.toThrow(/ADMIN_PASSWORD must be at least/);
    expect(mock.calls).toHaveLength(0);
  });

  it("never logs or returns the plaintext password", async () => {
    const mock = makeClient();
    mock.setResult({ rows: [], rowCount: 0 });
    mock.setResult({ rows: [{ id: "staff-1" }], rowCount: 1 });

    const result = await bootstrapAdmin(optsFor(mock.client, "admin@gerald.co.bw", "super-secret-password-xyz"));

    expect(JSON.stringify(result)).not.toContain("super-secret-password-xyz");
    for (const call of mock.calls) {
      expect(JSON.stringify(call.values)).not.toContain("super-secret-password-xyz");
      expect(call.sql).not.toContain("super-secret-password-xyz");
    }
  });
});
