import { randomUUID } from "node:crypto";

/**
 * Returns a request id: the `x-request-id` header if present, else a fresh UUID.
 * Use this to correlate log lines across a single HTTP request.
 */
export function requestId(req: Request): string {
  const hdr = req.headers.get("x-request-id");
  if (hdr && hdr.length > 0 && hdr.length <= 200) return hdr;
  return randomUUID();
}
