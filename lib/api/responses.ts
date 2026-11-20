export type ApiErrorCode =
  | "BAD_REQUEST"
  | "INVALID_PLATFORM"
  | "PLATFORM_REQUIRED"
  | "ITEM_NOT_FOUND"
  | "REPORTING_UNAVAILABLE"
  | "REPORT_DELIVERY_FAILED";

export function apiJson<T>(body: T, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: Record<string, string>,
): Response {
  return apiJson(
    {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    status,
  );
}
