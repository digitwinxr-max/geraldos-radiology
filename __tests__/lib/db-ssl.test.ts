import { describe, expect, it } from "vitest";
import { resolveSsl } from "@/db";

describe("resolveSsl", () => {
  it("enables Render-compatible TLS when sslmode is absent", () => {
    expect(resolveSsl("postgresql://user:pass@host:5432/geraldos")).toEqual({
      rejectUnauthorized: false,
    });
  });

  it("defers to the URL for sslmode=require (no silent downgrade)", () => {
    expect(
      resolveSsl("postgresql://user:pass@host:5432/geraldos?sslmode=require"),
    ).toBeUndefined();
  });

  it("does not weaken certificate verification for verify-ca", () => {
    expect(
      resolveSsl("postgresql://user:pass@host:5432/geraldos?sslmode=verify-ca"),
    ).toBeUndefined();
  });

  it("does not weaken certificate verification for verify-full", () => {
    expect(
      resolveSsl("postgresql://user:pass@host:5432/geraldos?sslmode=verify-full"),
    ).toBeUndefined();
  });

  it("defers to the URL for sslmode=disable (TLS off)", () => {
    expect(
      resolveSsl("postgresql://user:pass@host:5432/geraldos?sslmode=disable"),
    ).toBeUndefined();
  });
});
