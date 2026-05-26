import type { MedusaResponse } from "@medusajs/framework";

export function ok<T>(res: MedusaResponse, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function fail(
  res: MedusaResponse,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return res
    .status(status)
    .json({ success: false, error: { code, message, details } });
}

export function badRequest(res: MedusaResponse, message: string, details?: unknown) {
  return fail(res, 400, "bad_request", message, details);
}

export function unauthorized(res: MedusaResponse, message = "Unauthorized") {
  return fail(res, 401, "unauthorized", message);
}

export function notFound(res: MedusaResponse, message = "Not found") {
  return fail(res, 404, "not_found", message);
}

export function serverError(res: MedusaResponse, err: unknown) {
  const message =
    err instanceof Error ? err.message : "Internal server error";
  return fail(res, 500, "server_error", message);
}
