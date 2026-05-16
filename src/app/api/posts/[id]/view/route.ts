import { NextRequest } from "next/server";
import { recordView } from "@/lib/analytics/ingest";
import { ok } from "@/lib/api/response";
import { log } from "@/lib/observability/logger";
import { requestId } from "@/lib/observability/request-id";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public view-ingest endpoint. Idempotent within a session/day combo via
 * the session_hash column, so beacons can fire safely on every page load.
 *
 * This is a beacon — it MUST NOT block page rendering. We always return 200
 * even when recording fails; errors are logged structurally for ops.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rid = requestId(req);
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return ok({ ok: true });
  }
  const ua = req.headers.get("user-agent");
  const referer = req.headers.get("referer");
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  const country = req.headers.get("cf-ipcountry");
  try {
    await recordView({ postId: id, userAgent: ua, referer, ip, country });
  } catch (err) {
    log.error("view.record_failed", {
      rid,
      postId: id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return ok({ ok: true });
}
