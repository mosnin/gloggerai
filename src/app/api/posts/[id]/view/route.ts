import { NextRequest } from "next/server";
import { recordView } from "@/lib/analytics/ingest";
import { ok } from "@/lib/api/response";

/**
 * Public view-ingest endpoint. Idempotent within a session/day combo via
 * the session_hash column, so beacons can fire safely on every page load.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ua = req.headers.get("user-agent");
  const referer = req.headers.get("referer");
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  const country = req.headers.get("cf-ipcountry");
  await recordView({ postId: id, userAgent: ua, referer, ip, country });
  return ok({ ok: true });
}
