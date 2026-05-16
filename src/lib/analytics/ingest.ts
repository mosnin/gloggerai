import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

const BOT_PATTERNS = [
  /bot/i, /crawler/i, /spider/i, /scraper/i,
  /GPTBot/i, /ClaudeBot/i, /PerplexityBot/i, /Googlebot/i, /Bingbot/i,
  /facebookexternalhit/i, /Slackbot/i, /Twitterbot/i, /LinkedInBot/i,
  /headless/i, /curl/i, /wget/i,
];

function classifyUa(ua: string | null): { uaClass: string; isBot: boolean } {
  if (!ua) return { uaClass: "unknown", isBot: false };
  for (const re of BOT_PATTERNS) if (re.test(ua)) return { uaClass: "bot", isBot: true };
  if (/Mobile|Android|iPhone|iPad/i.test(ua)) return { uaClass: "mobile", isBot: false };
  return { uaClass: "desktop", isBot: false };
}

function refererHost(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).host;
  } catch {
    return null;
  }
}

function sessionHash(ip: string | null, ua: string | null, postId: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${ip ?? ""}|${ua ?? ""}|${day}|${postId}`).digest("hex").slice(0, 32);
}

export async function recordView(opts: {
  postId: string;
  userAgent: string | null;
  referer: string | null;
  ip: string | null;
  country?: string | null;
}): Promise<void> {
  const { uaClass, isBot } = classifyUa(opts.userAgent);
  const host = refererHost(opts.referer);
  const sh = sessionHash(opts.ip, opts.userAgent, opts.postId);
  await db.execute(sql`
    INSERT INTO post_views (post_id, referrer_host, country, ua_class, is_bot, session_hash)
    VALUES (${opts.postId}, ${host}, ${opts.country ?? null}, ${uaClass}, ${isBot}, ${sh})
  `);
}

export async function postAnalytics(postId: string, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const totals = await db.execute(sql`
    SELECT
      count(*)::int AS views,
      count(*) FILTER (WHERE NOT is_bot)::int AS human_views,
      count(*) FILTER (WHERE is_bot)::int AS bot_views,
      count(DISTINCT session_hash)::int AS unique_sessions
    FROM post_views
    WHERE post_id = ${postId} AND occurred_at >= ${since}
  `);

  const byDay = await db.execute(sql`
    SELECT
      date_trunc('day', occurred_at)::date AS day,
      count(*)::int AS views,
      count(*) FILTER (WHERE NOT is_bot)::int AS human_views
    FROM post_views
    WHERE post_id = ${postId} AND occurred_at >= ${since}
    GROUP BY 1 ORDER BY 1
  `);

  const byReferrer = await db.execute(sql`
    SELECT coalesce(referrer_host, '(direct)') AS host, count(*)::int AS views
    FROM post_views
    WHERE post_id = ${postId} AND occurred_at >= ${since} AND NOT is_bot
    GROUP BY 1 ORDER BY 2 DESC LIMIT 20
  `);

  const byClass = await db.execute(sql`
    SELECT coalesce(ua_class, 'unknown') AS ua_class, count(*)::int AS views
    FROM post_views
    WHERE post_id = ${postId} AND occurred_at >= ${since}
    GROUP BY 1 ORDER BY 2 DESC
  `);

  return {
    windowDays: days,
    totals: totals.rows[0],
    byDay: byDay.rows,
    byReferrer: byReferrer.rows,
    byUaClass: byClass.rows,
  };
}
