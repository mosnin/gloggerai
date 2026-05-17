import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { env } from "@/lib/env";
import { runCleanup } from "@/lib/jobs/cleanup";

export const dynamic = "force-dynamic";

/**
 * Serverless cron entrypoint for periodic table cleanup. Protect with a shared
 * secret — has no per-user auth (it runs against the whole DB). Same scheme as
 * /api/internal/jobs/tick.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== env.SESSION_SECRET) return fail("forbidden", "Bad cron secret", 403);
  const report = await runCleanup();
  return ok(report);
}

// Vercel cron sends GET. Accept both so it's invokable manually too.
export async function GET(req: NextRequest) {
  return POST(req);
}
