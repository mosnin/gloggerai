import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { limitsFor, type Tier } from "./plans";

export async function getTierForUser(userId: string): Promise<Tier> {
  const res = await db.execute(sql`
    SELECT tier::text AS tier, status::text AS status
    FROM subscriptions WHERE user_id = ${userId} LIMIT 1
  `);
  const row = res.rows[0] as { tier?: Tier; status?: string } | undefined;
  if (!row) return "free";
  if (row.status !== "active" && row.status !== "trialing") return "free";
  return row.tier ?? "free";
}

function periodStart(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export async function bumpUsage(opts: {
  userId: string;
  postsCreated?: number;
  postsPublished?: number;
  apiRequests?: number;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO plan_usage (user_id, period_start, posts_created, posts_published, api_requests)
    VALUES (
      ${opts.userId},
      ${periodStart()}::date,
      ${opts.postsCreated ?? 0},
      ${opts.postsPublished ?? 0},
      ${opts.apiRequests ?? 0}
    )
    ON CONFLICT (user_id, period_start) DO UPDATE SET
      posts_created    = plan_usage.posts_created    + EXCLUDED.posts_created,
      posts_published  = plan_usage.posts_published  + EXCLUDED.posts_published,
      api_requests     = plan_usage.api_requests     + EXCLUDED.api_requests
  `);
}

export async function currentUsage(userId: string) {
  const res = await db.execute(sql`
    SELECT posts_created, posts_published, api_requests
    FROM plan_usage
    WHERE user_id = ${userId} AND period_start = ${periodStart()}::date
    LIMIT 1
  `);
  const row = res.rows[0] as
    | { posts_created: number; posts_published: number; api_requests: number }
    | undefined;
  return {
    postsCreated: row?.posts_created ?? 0,
    postsPublished: row?.posts_published ?? 0,
    apiRequests: row?.api_requests ?? 0,
  };
}

export type QuotaCheck = { ok: true } | { ok: false; reason: string; limit: number; used: number };

/**
 * Atomic "reserve N from the monthly post quota" — INSERTs or UPDATEs the
 * plan_usage row and returns the new posts_created total in one statement.
 * Callers check the returned count; if it exceeds the tier limit they reject
 * the request AND must call releasePostReservation() to roll back.
 *
 * The previous two-step (checkPostQuota then bumpUsage after createPost)
 * allowed concurrent requests at the quota boundary to all pass the check
 * before any of them incremented.
 */
export async function reservePostQuota(opts: {
  userId: string;
  count?: number;
  publishedCount?: number;
}): Promise<QuotaCheck> {
  const count = opts.count ?? 1;
  const publishedCount = opts.publishedCount ?? 0;
  const tier = await getTierForUser(opts.userId);
  const limits = limitsFor(tier);

  const res = await db.execute<{ posts_created: number }>(sql`
    INSERT INTO plan_usage (user_id, period_start, posts_created, posts_published, api_requests)
    VALUES (${opts.userId}, ${periodStart()}::date, ${count}, ${publishedCount}, 0)
    ON CONFLICT (user_id, period_start) DO UPDATE SET
      posts_created    = plan_usage.posts_created    + EXCLUDED.posts_created,
      posts_published  = plan_usage.posts_published  + EXCLUDED.posts_published
    RETURNING posts_created
  `);
  const newTotal = Number((res.rows[0] as { posts_created: number } | undefined)?.posts_created ?? count);

  if (newTotal > limits.postsPerMonth) {
    // Roll back the bump so we don't strand the would-be-rejected reservation.
    await db.execute(sql`
      UPDATE plan_usage SET
        posts_created   = GREATEST(0, posts_created   - ${count}),
        posts_published = GREATEST(0, posts_published - ${publishedCount})
      WHERE user_id = ${opts.userId} AND period_start = ${periodStart()}::date
    `);
    return {
      ok: false,
      reason: `Plan '${tier}' allows ${limits.postsPerMonth} posts/month. Upgrade for more.`,
      limit: limits.postsPerMonth,
      used: newTotal - count,
    };
  }
  return { ok: true };
}

/** Release a previously-reserved quota slot (e.g. when createPost throws after we reserved). */
export async function releasePostReservation(opts: {
  userId: string;
  count?: number;
  publishedCount?: number;
}): Promise<void> {
  const count = opts.count ?? 1;
  const publishedCount = opts.publishedCount ?? 0;
  await db.execute(sql`
    UPDATE plan_usage SET
      posts_created   = GREATEST(0, posts_created   - ${count}),
      posts_published = GREATEST(0, posts_published - ${publishedCount})
    WHERE user_id = ${opts.userId} AND period_start = ${periodStart()}::date
  `);
}

/** @deprecated Use reservePostQuota for atomic check+bump. Kept for the /api/billing/me dashboard. */
export async function checkPostQuota(userId: string): Promise<QuotaCheck> {
  const tier = await getTierForUser(userId);
  const limits = limitsFor(tier);
  const usage = await currentUsage(userId);
  if (usage.postsCreated >= limits.postsPerMonth) {
    return {
      ok: false,
      reason: `Plan '${tier}' allows ${limits.postsPerMonth} posts/month. Upgrade for more.`,
      limit: limits.postsPerMonth,
      used: usage.postsCreated,
    };
  }
  return { ok: true };
}

export async function requireFeature(
  userId: string,
  feature: "scheduledPublishing" | "semanticSearch" | "customDomain",
): Promise<QuotaCheck> {
  const tier = await getTierForUser(userId);
  const limits = limitsFor(tier);
  if (!limits[feature]) {
    return { ok: false, reason: `Plan '${tier}' does not include ${feature}.`, limit: 0, used: 0 };
  }
  return { ok: true };
}

/** Tier-capped maximum value for a user-created API key's rateLimitPerMinute. */
export async function maxRateLimitForUser(userId: string): Promise<number> {
  const tier = await getTierForUser(userId);
  return limitsFor(tier).rateLimitPerMinute;
}
