import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

export const dynamic = "force-dynamic";

/**
 * Liveness + readiness probe for the platform. Returns 200 with a JSON body
 * describing each subsystem; 503 if any required subsystem is down. Keep this
 * cheap — load balancers may hit it once per second.
 */
export async function GET() {
  const started = Date.now();
  const out: {
    status: "ok" | "degraded" | "down";
    uptimeSec: number;
    db: { ok: boolean; latencyMs?: number; error?: string };
    version: string | null;
    timestamp: string;
  } = {
    status: "ok",
    uptimeSec: Math.round(process.uptime()),
    db: { ok: false },
    version: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.SOURCE_VERSION ?? null,
    timestamp: new Date().toISOString(),
  };

  try {
    const t0 = Date.now();
    await db.execute(sql`SELECT 1`);
    out.db = { ok: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    out.db = { ok: false, error: err instanceof Error ? err.message : String(err) };
    out.status = "down";
  }

  const code = out.status === "down" ? 503 : 200;
  return NextResponse.json({ ...out, totalMs: Date.now() - started }, {
    status: code,
    headers: { "cache-control": "no-store" },
  });
}
