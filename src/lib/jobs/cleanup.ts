import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { log } from "@/lib/observability/logger";

/**
 * Periodic cleanup of tables that accumulate but don't have product value past
 * a TTL. Idempotent — run as often as you like; each query is a bounded delete.
 *
 * Hooked into the Vercel cron via /api/internal/cleanup. The worker process
 * can also call this directly if you run it long-lived.
 */
export type CleanupReport = {
  idempotencyKeys: number;
  apiKeyUsage: number;
  sessions: number;
  oauthCodes: number;
};

const IDEMPOTENCY_TTL_HOURS = 24;
const API_KEY_USAGE_TTL_HOURS = 2;
const OAUTH_CODE_TTL_MINUTES = 30;

export async function runCleanup(): Promise<CleanupReport> {
  const report: CleanupReport = {
    idempotencyKeys: 0,
    apiKeyUsage: 0,
    sessions: 0,
    oauthCodes: 0,
  };

  // Idempotency keys: per Stripe convention, the cached response lifetime is
  // 24 hours. After that an agent retry should be a fresh request.
  const a = await db.execute<{ n: number }>(sql`
    WITH deleted AS (
      DELETE FROM idempotency_keys
      WHERE created_at < now() - (${IDEMPOTENCY_TTL_HOURS} || ' hours')::interval
      RETURNING 1
    )
    SELECT count(*)::int AS n FROM deleted
  `);
  report.idempotencyKeys = Number((a.rows[0] as { n: number } | undefined)?.n ?? 0);

  // Rate-limit counter rows: each (api_key, minute) row is only useful within
  // the current minute. Keep 2 hours for debugging, drop the rest.
  const b = await db.execute<{ n: number }>(sql`
    WITH deleted AS (
      DELETE FROM api_key_usage
      WHERE window_start < now() - (${API_KEY_USAGE_TTL_HOURS} || ' hours')::interval
      RETURNING 1
    )
    SELECT count(*)::int AS n FROM deleted
  `);
  report.apiKeyUsage = Number((b.rows[0] as { n: number } | undefined)?.n ?? 0);

  // Expired sessions: getCurrentUser already deletes individual ones lazily,
  // but a batch sweep keeps the table size bounded for inactive accounts.
  const c = await db.execute<{ n: number }>(sql`
    WITH deleted AS (
      DELETE FROM sessions WHERE expires_at < now() RETURNING 1
    )
    SELECT count(*)::int AS n FROM deleted
  `);
  report.sessions = Number((c.rows[0] as { n: number } | undefined)?.n ?? 0);

  // OAuth authorization codes: single-use, 10-min TTL. Anything older or
  // already consumed should be gone within an hour.
  const d = await db.execute<{ n: number }>(sql`
    WITH deleted AS (
      DELETE FROM oauth_authorization_codes
      WHERE used_at IS NOT NULL
         OR expires_at < now() - (${OAUTH_CODE_TTL_MINUTES} || ' minutes')::interval
      RETURNING 1
    )
    SELECT count(*)::int AS n FROM deleted
  `);
  report.oauthCodes = Number((d.rows[0] as { n: number } | undefined)?.n ?? 0);

  log.info("cleanup.done", { ...report });
  return report;
}
