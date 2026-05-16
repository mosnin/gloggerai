import { and, desc, eq, lt, sql } from "drizzle-orm";
import readingTime from "reading-time";
import { db } from "@/db/client";
import { posts, users, type Post } from "@/db/schema";
import { excerptFromMarkdown, slug as slugify, wordCount } from "@/lib/utils";
import { moderateContent } from "./moderation";
import { snapshotRevision, getRevision } from "./revisions";
import { upsertPostEmbedding } from "@/lib/embeddings/service";
import { enqueue } from "@/lib/jobs/queue";
import { fanOutEvent } from "@/lib/jobs/handlers";
import { notifyPostPublished } from "@/lib/engagement/notifications";
import type { PostCreateInput, PostUpdateInput } from "./schema";

function scheduleEmbedding(postId: string, title: string, body: string): void {
  void upsertPostEmbedding({ postId, title, body }).catch(() => {});
}

function announce(event: string, userId: string, data: Record<string, unknown>): void {
  void fanOutEvent({ event, userId, data }).catch(() => {});
}

function announcePublish(post: { id: string; authorId: string; tags: string[] }): void {
  void notifyPostPublished({ postId: post.id, authorId: post.authorId, tags: post.tags }).catch(() => {});
}

async function uniqueSlug(authorId: string, seed: string, ignoreId?: string): Promise<string> {
  const base = slugify(seed) || "post";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i}`;
    const [existing] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.authorId, authorId), eq(posts.slug, candidate)))
      .limit(1);
    if (!existing || existing.id === ignoreId) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export async function createPost(opts: {
  authorId: string;
  apiKeyId?: string | null;
  input: PostCreateInput;
}): Promise<Post> {
  const { authorId, apiKeyId, input } = opts;
  const slug = input.slug ?? (await uniqueSlug(authorId, input.title));
  const minutes = Math.max(1, Math.round(readingTime(input.contentMd).minutes));
  const moderation = await moderateContent(input.title, input.contentMd);
  const scheduled = input.publishAt ? new Date(input.publishAt) : null;
  const isScheduled = !!scheduled && scheduled > new Date();
  const finalStatus =
    isScheduled
      ? "draft"
      : input.status === "published" && moderation.status !== "rejected"
        ? "published"
        : "draft";

  const [row] = await db
    .insert(posts)
    .values({
      authorId,
      slug,
      title: input.title,
      subtitle: input.subtitle,
      contentMd: input.contentMd,
      excerpt: excerptFromMarkdown(input.contentMd),
      coverImageUrl: input.coverImageUrl,
      canonicalUrl: input.canonicalUrl,
      tags: input.tags,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription ?? excerptFromMarkdown(input.contentMd),
      keywords: input.keywords,
      status: finalStatus,
      moderationStatus: moderation.status,
      moderationNotes: moderation.notes,
      readingTimeMinutes: minutes,
      wordCount: wordCount(input.contentMd),
      publishedAt: finalStatus === "published" ? new Date() : null,
      publishAt: isScheduled ? scheduled : null,
      createdByApiKeyId: apiKeyId ?? null,
    })
    .returning();

  if (isScheduled && scheduled) {
    await enqueue({
      kind: "publish_scheduled",
      payload: { postId: row.id },
      runAt: scheduled,
    });
  }
  if (finalStatus === "published") {
    scheduleEmbedding(row.id, row.title, row.contentMd);
    announce("post.published", row.authorId, { postId: row.id, slug: row.slug });
    announcePublish({ id: row.id, authorId: row.authorId, tags: row.tags });
  }
  return row;
}

export async function updatePost(opts: {
  postId: string;
  authorId: string;
  apiKeyId?: string | null;
  input: PostUpdateInput;
}): Promise<Post | null> {
  const { postId, authorId, input, apiKeyId } = opts;
  const [current] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.authorId, authorId)))
    .limit(1);
  if (!current) return null;

  await snapshotRevision({ post: current, editedByUserId: authorId, editedByApiKeyId: apiKeyId ?? null });

  const patch: Partial<Post> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.subtitle !== undefined) patch.subtitle = input.subtitle;
  if (input.contentMd !== undefined) {
    patch.contentMd = input.contentMd;
    patch.excerpt = excerptFromMarkdown(input.contentMd);
    patch.readingTimeMinutes = Math.max(1, Math.round(readingTime(input.contentMd).minutes));
    patch.wordCount = wordCount(input.contentMd);
  }
  if (input.tags !== undefined) patch.tags = input.tags;
  if (input.coverImageUrl !== undefined) patch.coverImageUrl = input.coverImageUrl;
  if (input.canonicalUrl !== undefined) patch.canonicalUrl = input.canonicalUrl;
  if (input.seoTitle !== undefined) patch.seoTitle = input.seoTitle;
  if (input.seoDescription !== undefined) patch.seoDescription = input.seoDescription;
  if (input.keywords !== undefined) patch.keywords = input.keywords;
  if (input.slug !== undefined) patch.slug = await uniqueSlug(authorId, input.slug, postId);

  if (input.status === "published" && current.status !== "published") {
    const moderation = await moderateContent(
      patch.title ?? current.title,
      patch.contentMd ?? current.contentMd,
    );
    if (moderation.status === "rejected") {
      patch.status = "draft";
      patch.moderationStatus = "rejected";
      patch.moderationNotes = moderation.notes;
    } else {
      patch.status = "published";
      patch.moderationStatus = moderation.status;
      patch.moderationNotes = moderation.notes;
      patch.publishedAt = new Date();
    }
  } else if (input.status === "draft") {
    patch.status = "draft";
  }

  const [updated] = await db.update(posts).set(patch).where(eq(posts.id, postId)).returning();
  if (updated.status === "published") {
    scheduleEmbedding(updated.id, updated.title, updated.contentMd);
    const event = current.status === "published" ? "post.updated" : "post.published";
    announce(event, updated.authorId, { postId: updated.id, slug: updated.slug });
    if (current.status !== "published") {
      announcePublish({ id: updated.id, authorId: updated.authorId, tags: updated.tags });
    }
  }
  return updated;
}

export async function restorePostFromRevision(opts: {
  postId: string;
  authorId: string;
  revisionNumber: number;
  apiKeyId?: string | null;
}): Promise<Post | null> {
  const { postId, authorId, revisionNumber, apiKeyId } = opts;
  const [current] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.authorId, authorId)))
    .limit(1);
  if (!current) return null;
  const rev = await getRevision(postId, revisionNumber);
  if (!rev) return null;

  await snapshotRevision({ post: current, editedByUserId: authorId, editedByApiKeyId: apiKeyId ?? null });

  const patch: Partial<Post> = {
    title: rev.title,
    subtitle: rev.subtitle,
    contentMd: rev.contentMd,
    excerpt: excerptFromMarkdown(rev.contentMd),
    tags: rev.tags,
    keywords: rev.keywords,
    seoTitle: rev.seoTitle,
    seoDescription: rev.seoDescription,
    coverImageUrl: rev.coverImageUrl,
    readingTimeMinutes: Math.max(1, Math.round(readingTime(rev.contentMd).minutes)),
    wordCount: wordCount(rev.contentMd),
    updatedAt: new Date(),
  };

  const [updated] = await db.update(posts).set(patch).where(eq(posts.id, postId)).returning();
  if (updated.status === "published") scheduleEmbedding(updated.id, updated.title, updated.contentMd);
  return updated;
}

export async function deletePost(postId: string, authorId: string): Promise<boolean> {
  const res = await db
    .delete(posts)
    .where(and(eq(posts.id, postId), eq(posts.authorId, authorId)))
    .returning({ id: posts.id });
  if (res.length) announce("post.deleted", authorId, { postId });
  return res.length > 0;
}

export type PostListItem = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  tags: string[];
  status: Post["status"];
  readingTimeMinutes: number;
  publishedAt: Date | null;
  createdAt: Date;
  author: { handle: string; displayName: string; avatarUrl: string | null };
};

export async function listPosts(opts: {
  status?: Post["status"];
  authorId?: string;
  authorHandle?: string;
  tag?: string;
  q?: string;
  limit: number;
  cursor?: string;
}): Promise<{ items: PostListItem[]; nextCursor: string | null }> {
  const conds = [] as ReturnType<typeof eq>[];
  if (opts.status) conds.push(eq(posts.status, opts.status));
  if (opts.authorId) conds.push(eq(posts.authorId, opts.authorId));
  if (opts.authorHandle) conds.push(eq(users.handle, opts.authorHandle));
  if (opts.tag) conds.push(sql`${posts.tags} @> ${JSON.stringify([opts.tag])}::jsonb` as unknown as ReturnType<typeof eq>);
  if (opts.q) {
    conds.push(
      sql`(${posts.title} ILIKE ${"%" + opts.q + "%"} OR ${posts.contentMd} ILIKE ${"%" + opts.q + "%"})` as unknown as ReturnType<typeof eq>,
    );
  }
  if (opts.cursor) {
    const cursorDate = new Date(opts.cursor);
    if (!Number.isNaN(cursorDate.getTime())) {
      conds.push(lt(posts.createdAt, cursorDate));
    }
  }

  const rows = await db
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      subtitle: posts.subtitle,
      excerpt: posts.excerpt,
      tags: posts.tags,
      status: posts.status,
      readingTimeMinutes: posts.readingTimeMinutes,
      publishedAt: posts.publishedAt,
      createdAt: posts.createdAt,
      authorHandle: users.handle,
      authorDisplayName: users.displayName,
      authorAvatarUrl: users.avatarUrl,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(posts.createdAt))
    .limit(opts.limit + 1);

  const hasMore = rows.length > opts.limit;
  const items = rows.slice(0, opts.limit).map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    subtitle: r.subtitle,
    excerpt: r.excerpt,
    tags: r.tags,
    status: r.status,
    readingTimeMinutes: r.readingTimeMinutes,
    publishedAt: r.publishedAt,
    createdAt: r.createdAt,
    author: {
      handle: r.authorHandle,
      displayName: r.authorDisplayName,
      avatarUrl: r.authorAvatarUrl,
    },
  }));
  const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;
  return { items, nextCursor };
}

export async function getPost(opts: { id?: string; authorHandle?: string; slug?: string }) {
  const conds = [] as ReturnType<typeof eq>[];
  if (opts.id) conds.push(eq(posts.id, opts.id));
  if (opts.authorHandle) conds.push(eq(users.handle, opts.authorHandle));
  if (opts.slug) conds.push(eq(posts.slug, opts.slug));

  const [row] = await db
    .select({ post: posts, author: users })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(and(...conds))
    .limit(1);
  return row ?? null;
}

