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
