/**
 * GeraldOS — Structured Logger
 *
 * Dependency-free JSON-lines logger. Every entry is one line:
 *   { ts, level, msg, requestId?, method?, path?, userId?, ...fields }
 * Request context (requestId, method, path, userId) is enriched automatically
 * from the AsyncLocalStorage context established by withAuth.
 *
 * Secrets audit note: this module reads LOG_LEVEL / NODE_ENV directly from
 * process.env. It intentionally does NOT import src/lib/env.ts — env.ts is a
 * bootstrap module that warns before logging is available, and importing it
 * here would create a cycle.
 */

import { getRequestContext } from "@/lib/request-context";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type LogLevel = keyof typeof LEVELS;

/** Threshold is read per emission so LOG_LEVEL changes apply immediately. */
function threshold(): number {
  const raw = process.env.LOG_LEVEL?.toLowerCase();
  if (raw && raw in LEVELS) return LEVELS[raw as LogLevel];
  // Default: debug in development, info everywhere else.
  return process.env.NODE_ENV === "development" ? LEVELS.debug : LEVELS.info;
}

/** Compact, JSON-safe representation of an unknown thrown value. */
export function serializeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: "Error", message: typeof error === "string" ? error : JSON.stringify(error) ?? String(error) };
}

function emit(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
  if (LEVELS[level] < threshold()) return;

  const ctx = getRequestContext();
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
  };
  if (ctx) {
    entry.requestId = ctx.requestId;
    entry.method = ctx.method;
    entry.path = ctx.path;
    if (ctx.userId) entry.userId = ctx.userId;
  }
  if (fields) Object.assign(entry, fields);

  const line = JSON.stringify(entry) + "\n";
  if (level === "error") {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
};
