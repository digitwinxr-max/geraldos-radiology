/**
 * GeraldOS — Structured API Error Responses
 *
 * Every API error follows a consistent shape so that front-end code,
 * monitoring tools and audit consumers can parse them reliably.
 */

import { NextResponse } from "next/server";

// ─── Error shape ───

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ─── Generic builder ───

export function apiError(
  code: string,
  message: string,
  status: number,
  details?: unknown,
): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = { error: { code, message } };
  if (details !== undefined) body.error.details = details;
  return NextResponse.json(body, { status });
}

// ─── Convenience helpers ───

export function unauthorized(message = "Authentication required"): NextResponse<ApiErrorBody> {
  return apiError("UNAUTHORIZED", message, 401);
}

export function forbidden(message = "Insufficient permissions"): NextResponse<ApiErrorBody> {
  return apiError("FORBIDDEN", message, 403);
}

export function notFound(entity = "resource"): NextResponse<ApiErrorBody> {
  return apiError("NOT_FOUND", `${entity} not found`, 404);
}

export function validationFailed(issues: unknown): NextResponse<ApiErrorBody> {
  return apiError("VALIDATION_FAILED", "Request validation failed", 400, issues);
}

export function internalError(): NextResponse<ApiErrorBody> {
  return apiError("INTERNAL_ERROR", "An unexpected error occurred", 500);
}
