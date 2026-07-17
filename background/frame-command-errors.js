const FRAME_ROUTE_CODES = new Set([
  "NOT_REGISTERED",
  "STALE_DOCUMENT",
  "INJECTION_FAILED",
  "TIMEOUT",
  "ABORTED",
  "REMOTE_ERROR"
]);

export function frameRouteError(code, message, delivered = undefined, cause = null) {
  const error = new Error(message);
  error.code = code;
  if (typeof delivered === "boolean") error.delivered = delivered;
  if (cause) error.cause = cause;
  return error;
}

export function normalizeFrameTransportError(error) {
  if (FRAME_ROUTE_CODES.has(error?.code)) return error;
  const message = error?.message || String(error);
  if (/timeout/i.test(message)) return frameRouteError("TIMEOUT", message, true, error);
  return frameRouteError("REMOTE_ERROR", message, true, error);
}
