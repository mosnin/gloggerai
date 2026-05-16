import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { claps } from "@/db/schemas/engagement";
import { posts } from "@/db/schema";
import { notifyClapThreshold, distinctClapperCount } from "./notifications";

export async function upsertClap(opts: { postId: string; userId: string; count: number }): Promise<{
  total: number;
  mine: number;
}> {
  if (opts.count < 1 || opts.count > 50) throw new Error("count must be 1..50");

  const [post] = await db
    .select({ id: posts.id, authorId: posts.authorId, status: posts.status })
    .from(posts)
    .where(eq(posts.id, opts.postId))
    .limit(1);
  if (!post || post.status !== "published") throw new Error("post_not_found");

  // Capture distinct clappers before and after; used for threshold notification.
  const beforeDistinct = await distinctClapperCount(opts.postId);

  await db
    .insert(claps)
    .values({ postId: opts.postId, userId: opts.userId, count: opts.count, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [claps.postId, claps.userId],
      set: { count: opts.count, updatedAt: new Date() },
    });

  // Recompute denormalized total atomically.
  const [updated] = await db.execute<{ total: number }>(sql`
    WITH agg AS (
      SELECT COALESCE(SUM(count), 0)::int AS total FROM claps WHERE post_id = ${opts.postId}
    )
    UPDATE posts SET claps_total = agg.total FROM agg WHERE id = ${opts.postId} RETURNING claps_total AS total
  `).then((r) => r.rows as Array<{ total: number }>);

  const afterDistinct = await distinctClapperCount(opts.postId);
  if (afterDistinct > beforeDistinct) {
    await notifyClapThreshold({
      postId: post.id,
      postAuthorId: post.authorId,
      totalClappers: afterDistinct,
    });
  }

  return { total: updated?.total ?? 0, mine: opts.count };
}

export async function getClapState(opts: { postId: string; userId?: string | null }) {
  const [total] = await db.execute<{ total: number }>(sql`
    SELECT COALESCE(claps_total, 0)::int AS total FROM posts WHERE id = ${opts.postId}
  `).then((r) => r.rows as Array<{ total: number }>);

  let mine = 0;
  if (opts.userId) {
    const [row] = await db
      .select({ count: claps.count })
      .from(claps)
      .where(and(eq(claps.postId, opts.postId), eq(claps.userId, opts.userId)))
      .limit(1);
    mine = row?.count ?? 0;
  }
  return { total: total?.total ?? 0, mine };
}
