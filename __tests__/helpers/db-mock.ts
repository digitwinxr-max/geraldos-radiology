/**
 * Shared test infrastructure for mocking the Drizzle database layer.
 *
 * `createDbMock()` returns a chainable stand-in for the drizzle `db` object.
 * Every builder method (select/insert/update/delete/from/where/leftJoin/
 * orderBy/limit/offset/groupBy/set/values/returning/...) returns the chain,
 * and AWAITING the chain consumes the next scripted result (FIFO). `execute()`
 * resolves `{ rows: <next result> }` for raw SQL queries.
 *
 * Scripting contract: script one result per awaited builder, in execution
 * order — including inserts without `.returning()` that are still awaited.
 * Unscripted awaits resolve to `[]`.
 *
 * Usage in a suite:
 *
 * ```ts
 * import { dbMock } from "../helpers/db-mock";
 *
 * vi.mock("@/db", async () => {
 *   const { dbMock } = await import("../helpers/db-mock");
 *   return { db: dbMock.db };
 * });
 * vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
 * vi.mock("@/lib/events", async (importOriginal) => {
 *   const actual = await importOriginal<typeof import("@/lib/events")>();
 *   return { ...actual, publishEvent: vi.fn().mockResolvedValue(undefined) };
 * });
 *
 * import { listPatients } from "@/services/patients";
 *
 * beforeEach(() => dbMock.reset());
 * ```
 */

import type { SessionUser } from "@/lib/auth/session";

export interface RecordedCall {
  method: string;
  args: unknown[];
}

type Chain = PromiseLike<unknown> & {
  [method: string]: (...args: unknown[]) => Chain;
};

export interface DbMock {
  /** The object to expose from `vi.mock("@/db")`. */
  db: {
    select: (...args: unknown[]) => Chain;
    insert: (...args: unknown[]) => Chain;
    update: (...args: unknown[]) => Chain;
    delete: (...args: unknown[]) => Chain;
    execute: (...args: unknown[]) => Promise<{ rows: unknown[] }>;
  };
  /** Queue the value the next awaited builder (or `execute`) resolves to. */
  result: (value: unknown) => void;
  /** Flat log of every builder method call, in order. */
  calls: RecordedCall[];
  /** Filtered view of `calls` for one method name. */
  callsFor: (method: string) => RecordedCall[];
  /** Clear the result queue and call log. */
  reset: () => void;
}

export function createDbMock(): DbMock {
  const results: unknown[] = [];
  const calls: RecordedCall[] = [];

  const consume = () => (results.length > 0 ? results.shift() : []);
  const log = (call: RecordedCall) => {
    calls.push(call);
  };

  const createChain = (): Chain => {
    const proxy = new Proxy((() => {}) as unknown as Chain, {
      get(_target, prop) {
        if (prop === "then") {
          return (
            onFulfilled?: ((value: unknown) => unknown) | null,
            onRejected?: ((reason: unknown) => unknown) | null,
          ) => Promise.resolve(consume()).then(onFulfilled, onRejected);
        }
        if (typeof prop === "symbol") return undefined;
        return (...args: unknown[]) => {
          log({ method: prop, args });
          return createChain();
        };
      },
      apply() {
        return createChain();
      },
    });
    return proxy;
  };

  const start = (method: string) => (...args: unknown[]) => {
    log({ method, args });
    return createChain();
  };

  return {
    db: {
      select: start("select"),
      insert: start("insert"),
      update: start("update"),
      delete: start("delete"),
      execute: async (...args: unknown[]) => {
        log({ method: "execute", args });
        return { rows: consume() as unknown[] };
      },
    },
    result: (value: unknown) => {
      results.push(value);
    },
    calls,
    callsFor: (method: string) => calls.filter((c) => c.method === method),
    reset: () => {
      results.length = 0;
      calls.length = 0;
    },
  };
}

/** Shared singleton — import from test suites (see header for the pattern). */
export const dbMock = createDbMock();

/** Authenticated user handed to route handlers by the mocked withAuth. */
export const mockUser: SessionUser = {
  sub: "test-user",
  name: "Test User",
  email: "test@gerald.co.za",
  roles: ["administrator"],
  iss: "geraldos-test",
};
