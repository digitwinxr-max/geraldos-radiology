/**
 * GeraldOS Typed API Client
 *
 * Single fetch wrapper shared by every React Query hook. Understands the
 * Phase 5 list envelope (`{ data, meta }`), the structured error envelope
 * (`{ error: { code, message, details? } }`), and leaves non-envelope JSON
 * (command centre, integrations, orthanc, facets) untouched.
 */

export interface ListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ListEnvelope<T> {
  data: T[];
  meta: ListMeta;
}

/** Structured failure raised by every api-client helper. */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (error) {
    throw new ApiClientError(0, "NETWORK_ERROR", "Network request failed", error);
  }

  // Some endpoints legitimately return empty bodies (e.g. 204).
  const text = await res.text();
  const body: unknown = text ? safeParse(text) : undefined;

  if (!res.ok) {
    const envelope = body as { error?: { code?: string; message?: string; details?: unknown } } | null;
    throw new ApiClientError(
      res.status,
      envelope?.error?.code ?? `HTTP_${res.status}`,
      envelope?.error?.message ?? (res.statusText || `Request failed with status ${res.status}`),
      envelope?.error?.details
    );
  }

  return body as T;
}

/** Generic JSON request — returns the parsed body, throws `ApiClientError` on failure. */
export function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(path, init);
}

/** GET an endpoint that returns the canonical list envelope (extra top-level keys like `unread` are preserved). */
export function getList<T, Extra extends object = object>(path: string): Promise<ListEnvelope<T> & Extra> {
  return request<ListEnvelope<T> & Extra>(path);
}

/** GET an endpoint with a non-envelope response (command centre, integrations, orthanc, facets). */
export function getJson<T>(path: string): Promise<T> {
  return request<T>(path);
}

/** POST/PATCH/DELETE with a JSON body (or FormData passthrough for multipart uploads). */
export function mutate<T = unknown>(method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      init.body = body;
    } else {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }
  }
  return request<T>(path, init);
}
