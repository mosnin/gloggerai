import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { bookmarks } from "@/db/schemas/engagement";
import { posts, users } from "@/db/schema";

export async function addBookmark(opts: { userId: string; postId: string }) {
  const [exists] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(eq(posts.id, opts.postId))
    .limit(1);
  if (!exists) return { error: "post_not_found" as const };
  await db
    .insert(bookmarks)
    .values({ userId: opts.userId, postId: opts.postId })
    .onConflictDoNothing();
  return { ok: true as const };
}

export async function removeBookmark(opts: { userId: string; postId: string }) {
  await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.userId, opts.userId), eq(bookmarks.postId, opts.postId)));
}

export async function isBookmarked(opts: { userId: string; postId: string }): Promise<boolean> {
  const [row] = await db
    .select({ p: bookmarks.postId })
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, opts.userId), eq(bookmarks.postId, opts.postId)))
    .limit(1);
  return !!row;
}

export async function listBookmarks(opts: { userId: string; limit: number; cursor?: string }) {
  const conds = [eq(bookmarks.userId, opts.userId)];
  if (opts.cursor) {
    const d = new Date(opts.cursor);
    if (!Number.isNaN(d.getTime())) conds.push(lt(bookmarks.createdAt, d));
  }
  const rows = await db
    .select({
      bookmarkedAt: bookmarks.createdAt,
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      subtitle: posts.subtitle,
      excerpt: posts.excerpt,
      tags: posts.tags,
      readingTimeMinutes: posts.readingTimeMinutes,
      publishedAt: posts.publishedAt,
      authorHandle: users.handle,
      authorDisplayName: users.displayName,
      authorAvatarUrl: users.avatarUrl,
    })
    .from(bookmarks)
    .innerJoin(posts, eq(posts.id, bookmarks.postId))
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(and(...conds))
    .orderBy(desc(bookmarks.createdAt))
    .limit(opts.limit + 1);
  const hasMore = rows.length > opts.limit;
  const items = rows.slice(0, opts.limit);
  return {
    items,
    nextCursor: hasMore ? items[items.length - 1].bookmarkedAt.toISOString() : null,
  };
}
