import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { comments, type Comment } from "@/db/schemas/engagement";
import { posts, users } from "@/db/schema";
import { moderateContent } from "@/lib/posts/moderation";
import { notifyCommentCreated } from "./notifications";

export type CommentListItem = {
  id: string;
  postId: string;
  parentId: string | null;
  bodyMd: string;
  moderationStatus: Comment["moderationStatus"];
  createdAt: Date;
  author: { id: string; handle: string; displayName: string; avatarUrl: string | null };
  replyCount: number;
};

export async function listCommentsForPost(opts: {
  postId: string;
  limit: number;
  cursor?: string;
}): Promise<{ items: CommentListItem[]; nextCursor: string | null }> {
  const conds = [eq(comments.postId, opts.postId), isNull(comments.parentId)];
  if (opts.cursor) {
    const d = new Date(opts.cursor);
    if (!Number.isNaN(d.getTime())) conds.push(lt(comments.createdAt, d));
  }
  const rows = await db
    .select({
      id: comments.id,
      postId: comments.postId,
      parentId: comments.parentId,
      bodyMd: comments.bodyMd,
      moderationStatus: comments.moderationStatus,
      createdAt: comments.createdAt,
      authorId: users.id,
      handle: users.handle,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(and(...conds))
    .orderBy(desc(comments.createdAt))
    .limit(opts.limit + 1);

  const hasMore = rows.length > opts.limit;
  const parents = rows.slice(0, opts.limit);
  const parentIds = parents.map((r) => r.id);

  const replyCounts = new Map<string, number>();
  if (parentIds.length) {
    const counts = await db
      .select({ parentId: comments.parentId, n: sql<number>`count(*)::int` })
      .from(comments)
      .where(inArray(comments.parentId, parentIds))
      .groupBy(comments.parentId);
    for (const c of counts) {
      if (c.parentId) replyCounts.set(c.parentId, c.n);
    }
  }

  return {
    items: parents.map((r) => ({
      id: r.id,
      postId: r.postId,
      parentId: r.parentId,
      bodyMd: r.bodyMd,
      moderationStatus: r.moderationStatus,
      createdAt: r.createdAt,
      author: { id: r.authorId, handle: r.handle, displayName: r.displayName, avatarUrl: r.avatarUrl },
      replyCount: replyCounts.get(r.id) ?? 0,
    })),
    nextCursor: hasMore ? parents[parents.length - 1].createdAt.toISOString() : null,
  };
}

export async function listReplies(opts: { parentId: string; limit: number }) {
  const rows = await db
    .select({
      id: comments.id,
      postId: comments.postId,
      parentId: comments.parentId,
      bodyMd: comments.bodyMd,
      moderationStatus: comments.moderationStatus,
      createdAt: comments.createdAt,
      authorId: users.id,
      handle: users.handle,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.parentId, opts.parentId))
    .orderBy(asc(comments.createdAt))
    .limit(opts.limit);
  return rows;
}

export async function createComment(opts: {
  postId: string;
  authorId: string;
  bodyMd: string;
  parentId?: string | null;
}) {
  const [post] = await db
    .select({ id: posts.id, authorId: posts.authorId, status: posts.status })
    .from(posts)
    .where(eq(posts.id, opts.postId))
    .limit(1);
  if (!post || post.status !== "published") return { error: "post_not_found" as const };

  if (opts.parentId) {
    // Enforce 1-level nesting: parent must itself be top-level.
    const [parent] = await db
      .select({ id: comments.id, parentId: comments.parentId, postId: comments.postId })
      .from(comments)
      .where(eq(comments.id, opts.parentId))
      .limit(1);
    if (!parent || parent.postId !== opts.postId) return { error: "parent_not_found" as const };
    if (parent.parentId) return { error: "nesting_too_deep" as const };
  }

  const moderation = await moderateContent("comment", opts.bodyMd);
  if (moderation.status === "rejected") return { error: "rejected" as const, notes: moderation.notes };

  const [row] = await db
    .insert(comments)
    .values({
      postId: opts.postId,
      authorId: opts.authorId,
      parentId: opts.parentId ?? null,
      bodyMd: opts.bodyMd,
      moderationStatus: moderation.status,
      moderationNotes: moderation.notes,
    })
    .returning();

  await notifyCommentCreated({
    postId: post.id,
    postAuthorId: post.authorId,
    commentAuthorId: opts.authorId,
    commentId: row.id,
  });

  return { comment: row };
}

export async function deleteComment(opts: { id: string; userId: string }): Promise<boolean> {
  const res = await db
    .delete(comments)
    .where(and(eq(comments.id, opts.id), eq(comments.authorId, opts.userId)))
    .returning({ id: comments.id });
  return res.length > 0;
}
