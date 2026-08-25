/**
 * GeraldOS — Request Context
 *
 * AsyncLocalStorage-backed per-request context. Established by withAuth for
 * every authenticated request; consumed by the logger (automatic enrichment)
 * and any code that needs the current requestId/userId without threading
 * arguments through the call stack.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  requestId: string;
  method: string;
  path: string;
  userId?: string;
  startedAtMs: number;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Run `fn` with the given request context active for its whole async tree. */
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** The active request context, or undefined outside a traced request. */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
