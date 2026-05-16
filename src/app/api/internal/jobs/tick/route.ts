import { NextRequest } from "next/server";
import { runOnce } from "@/lib/jobs/worker";
import { fail, ok } from "@/lib/api/response";
import { env } from "@/lib/env";

/**
 * Serverless cron entrypoint. Protect with a shared secret since this
 * has no per-user auth (it runs the global queue).
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== env.SESSION_SECRET) return fail("forbidden", "Bad cron secret", 403);
  const processed = await runOnce();
  return ok({ processed });
}
