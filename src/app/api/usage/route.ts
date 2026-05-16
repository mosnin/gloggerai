import { NextRequest } from "next/server";
import { and, eq, gte, count, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { apiKeyUsage, posts } from "@/db/schema";
import { authenticate } from "@/lib/api/auth-guard";
import { ok } from "@/lib/api/response";
import { currentUsage, getTierForUser } from "@/lib/billing/service";
import { limitsFor } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const tier = await getTierForUser(auth.user.id);
  const limits = limitsFor(tier);
  const usage = await currentUsage(auth.user.id);

  const sinceMidnight = new Date();
  sinceMidnight.setUTCHours(0, 0, 0, 0);
  const [todayRow] = await db
    .select({ n: count() })
    .from(posts)
    .where(and(eq(posts.authorId, auth.user.id), gte(posts.createdAt, sinceMidnight)));
  const postsToday = Number(todayRow?.n ?? 0);

  let apiKey: {
    limitPerMinute: number;
    remainingThisMinute: number;
    windowResetsAt: string;
  } | null = null;

  if (auth.kind === "api_key") {
    const windowStart = new Date(Math.floor(Date.now() / 60_000) * 60_000);
    const windowResetsAt = new Date(windowStart.getTime() + 60_000);
    const [row] = await db
      .select({ count: apiKeyUsage.count })
      .from(apiKeyUsage)
      .where(and(eq(apiKeyUsage.apiKeyId, auth.key.id), sql`${apiKeyUsage.windowStart} = ${windowStart}`))
      .limit(1);
    const used = row?.count ?? 0;
    apiKey = {
      limitPerMinute: auth.key.rateLimitPerMinute,
      remainingThisMinute: Math.max(0, auth.key.rateLimitPerMinute - used),
      windowResetsAt: windowResetsAt.toISOString(),
    };
  }

  return ok({
    apiKey,
    plan: {
      tier,
      postsThisPeriod: usage.postsCreated,
      postsLimit: limits.postsPerMonth,
      apiRequestsThisPeriod: usage.apiRequests,
      apiRequestsLimit: limits.apiRequestsPerMonth,
      postsToday,
      postsTodayLimit: 200,
    },
  });
}
