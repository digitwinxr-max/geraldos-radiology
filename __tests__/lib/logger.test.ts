import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { logger, serializeError } from "@/lib/logger";
import { runWithRequestContext } from "@/lib/request-context";

let stdoutSpy: MockInstance<(chunk: unknown) => boolean>;
let stderrSpy: MockInstance<(chunk: unknown) => boolean>;

beforeEach(() => {
  vi.unstubAllEnvs();
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function stdoutLines(): Record<string, unknown>[] {
  return stdoutSpy.mock.calls.map((c) => JSON.parse(String(c[0])));
}
function stderrLines(): Record<string, unknown>[] {
  return stderrSpy.mock.calls.map((c) => JSON.parse(String(c[0])));
}

describe("logger", () => {
  it("emits one JSON line per entry with ts, level, msg and custom fields", () => {
    logger.info("something happened", { status: 200 });

    const [line] = stdoutLines();
    expect(line.level).toBe("info");
    expect(line.msg).toBe("something happened");
    expect(line.status).toBe(200);
    expect(typeof line.ts).toBe("string");
    expect(new Date(line.ts as string).toISOString()).toBe(line.ts);
  });

  it("routes error entries to stderr and everything else to stdout", () => {
    logger.warn("careful");
    logger.error("broken");

    expect(stdoutLines().map((l) => l.level)).toEqual(["warn"]);
    expect(stderrLines().map((l) => l.level)).toEqual(["error"]);
  });

  it("filters below the LOG_LEVEL threshold", () => {
    vi.stubEnv("LOG_LEVEL", "error");

    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");

    expect(stdoutLines()).toHaveLength(0);
    expect(stderrLines()).toHaveLength(1);
  });

  it("defaults to info outside development (debug filtered)", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("LOG_LEVEL", "");

    logger.debug("hidden");
    logger.info("visible");

    expect(stdoutLines().map((l) => l.msg)).toEqual(["visible"]);
  });

  it("emits debug entries when LOG_LEVEL=debug", () => {
    vi.stubEnv("LOG_LEVEL", "debug");

    logger.debug("trace me");

    expect(stdoutLines().map((l) => l.msg)).toEqual(["trace me"]);
  });

  it("enriches entries with the active request context", () => {
    runWithRequestContext(
      {
        requestId: "req-1",
        method: "POST",
        path: "/api/test",
        userId: "user-9",
        startedAtMs: Date.now(),
      },
      () => logger.info("inside context"),
    );

    const [line] = stdoutLines();
    expect(line.requestId).toBe("req-1");
    expect(line.method).toBe("POST");
    expect(line.path).toBe("/api/test");
    expect(line.userId).toBe("user-9");
  });

  it("omits context fields outside a traced request", () => {
    logger.info("no context");

    const [line] = stdoutLines();
    expect(line).not.toHaveProperty("requestId");
    expect(line).not.toHaveProperty("userId");
  });
});

describe("serializeError", () => {
  it("captures name, message and stack from Error instances", () => {
    const err = new TypeError("bad input");
    const s = serializeError(err);
    expect(s.name).toBe("TypeError");
    expect(s.message).toBe("bad input");
    expect(s.stack).toContain("TypeError");
  });

  it("wraps strings", () => {
    expect(serializeError("plain failure")).toEqual({ name: "Error", message: "plain failure" });
  });

  it("wraps arbitrary values as JSON", () => {
    expect(serializeError({ code: 42 })).toEqual({ name: "Error", message: '{"code":42}' });
  });
});
