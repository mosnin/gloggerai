import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { postRevisions, type PostRevision } from "@/db/schemas/content";
import type { Post } from "@/db/schema";

export async function snapshotRevision(opts: {
  post: Post;
  editedByUserId: string;
  editedByApiKeyId?: string | null;
}): Promise<PostRevision> {
  const { post, editedByUserId, editedByApiKeyId } = opts;
  const res = await db.execute(
    sql`SELECT COALESCE(MAX(revision_number), 0) + 1 AS next FROM post_revisions WHERE post_id = ${post.id}`,
  );
  const row0 = (res.rows as Array<{ next: number | string }>)[0];
  const revisionNumber = Number(row0?.next ?? 1);
  const [row] = await db
    .insert(postRevisions)
    .values({
      postId: post.id,
      revisionNumber,
      title: post.title,
      subtitle: post.subtitle,
      contentMd: post.contentMd,
      tags: post.tags,
      keywords: post.keywords,
      seoTitle: post.seoTitle,
      seoDescription: post.seoDescription,
      coverImageUrl: post.coverImageUrl,
      status: post.status,
      editedByUserId,
      editedByApiKeyId: editedByApiKeyId ?? null,
    })
    .returning();
  return row;
}

export type RevisionListItem = {
  id: string;
  revisionNumber: number;
  title: string;
  status: string;
  editedByUserId: string;
  editedByApiKeyId: string | null;
  createdAt: Date;
};

export async function listRevisions(opts: {
  postId: string;
  limit: number;
  cursor?: string;
}): Promise<{ items: RevisionListItem[]; nextCursor: string | null }> {
  const conds = [eq(postRevisions.postId, opts.postId)];
  if (opts.cursor) {
    const n = Number(opts.cursor);
    if (Number.isFinite(n)) conds.push(lt(postRevisions.revisionNumber, n));
  }
  const rows = await db
    .select({
      id: postRevisions.id,
      revisionNumber: postRevisions.revisionNumber,
      title: postRevisions.title,
      status: postRevisions.status,
      editedByUserId: postRevisions.editedByUserId,
      editedByApiKeyId: postRevisions.editedByApiKeyId,
      createdAt: postRevisions.createdAt,
    })
    .from(postRevisions)
    .where(and(...conds))
    .orderBy(desc(postRevisions.revisionNumber))
    .limit(opts.limit + 1);
  const hasMore = rows.length > opts.limit;
  const items = rows.slice(0, opts.limit);
  const nextCursor = hasMore ? String(items[items.length - 1].revisionNumber) : null;
  return { items, nextCursor };
}

export async function getRevision(postId: string, revisionNumber: number): Promise<PostRevision | null> {
  const [row] = await db
    .select()
    .from(postRevisions)
    .where(and(eq(postRevisions.postId, postId), eq(postRevisions.revisionNumber, revisionNumber)))
    .limit(1);
  return row ?? null;
}
