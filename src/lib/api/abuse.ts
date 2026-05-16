import { and, eq, gte, count } from "drizzle-orm";
import { db } from "@/db/client";
import { posts } from "@/db/schema";

/**
 * Per-author publish ceiling: max 200 posts / 24h.
 * Stops a compromised key from blasting spam even within rate-limit windows.
 */
export async function checkDailyPostLimit(authorId: string): Promise<{ ok: boolean; used: number; cap: number }> {
  const since = new Date(Date.now() - 86_400_000);
  const [row] = await db
    .select({ n: count() })
    .from(posts)
    .where(and(eq(posts.authorId, authorId), gte(posts.createdAt, since)));
  const cap = 200;
  return { ok: (row?.n ?? 0) < cap, used: Number(row?.n ?? 0), cap };
}
