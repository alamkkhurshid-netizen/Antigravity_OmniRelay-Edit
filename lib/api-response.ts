import { NextResponse } from "next/server";

export interface ApiSuccessResponse<T> {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  ok: false;
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

/**
 * Standardized success response helper for Next.js route handlers
 */
export function apiSuccess<T>(data: T, status = 200, meta?: Record<string, unknown>) {
  const body: ApiSuccessResponse<T> = {
    ok: true,
    data,
    ...(meta ? { meta } : {}),
  };
  return NextResponse.json(body, { status });
}

/**
 * Standardized error response helper for Next.js route handlers
 */
export function apiError(
  message: string,
  status = 500,
  code?: string,
  details?: unknown
) {
  const body: ApiErrorResponse = {
    ok: false,
    error: {
      message,
      ...(code ? { code } : {}),
      ...(details ? { details } : {}),
    },
  };
  return NextResponse.json(body, { status });
}

/**
 * Standardized validation error response helper
 */
export function apiValidationError(details: unknown, message = "Validation failed") {
  return apiError(message, 422, "VALIDATION_ERROR", details);
}
