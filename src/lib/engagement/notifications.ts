import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { notifications, claps } from "@/db/schemas/engagement";

const FANOUT_CAP = 1000;
const CLAP_THRESHOLDS = [10, 50, 100];

export type NotificationKind =
  | "comment.created"
  | "post.published.by_followee"
  | "claps.received_threshold";

// Threshold value appended to dedupe so each tier (10/50/100) lands once.
function thresholdKind(t: number): string {
  return `claps.received_threshold.${t}`;
}

export async function createNotification(opts: {
  userId: string;
  kind: NotificationKind;
  payload?: Record<string, unknown>;
  postId?: string | null;
  actorId?: string | null;
}): Promise<void> {
  await db
    .insert(notifications)
    .values({
      userId: opts.userId,
      kind: opts.kind,
      payload: opts.payload ?? {},
      postId: opts.postId ?? null,
      actorId: opts.actorId ?? null,
    })
    .onConflictDoNothing();
}

export async function notifyCommentCreated(opts: {
  postId: string;
  postAuthorId: string;
  commentAuthorId: string;
  commentId: string;
}): Promise<void> {
  if (opts.postAuthorId === opts.commentAuthorId) return;
  await createNotification({
    userId: opts.postAuthorId,
    kind: "comment.created",
    payload: { commentId: opts.commentId },
    postId: opts.postId,
    actorId: opts.commentAuthorId,
  });
}

export async function notifyPostPublished(opts: {
  postId: string;
  authorId: string;
  tags: string[];
}): Promise<void> {
  // Union of user-followers and topic-followers, capped, excluding the author.
  // The tag list is interpolated as individual params via sql.join because
  // drizzle's sql tag doesn't auto-serialize JS arrays to PG text[].
  const tagsParam = opts.tags.length
    ? sql`(${sql.join(opts.tags.map((t) => sql`${t}`), sql`, `)})`
    : sql`(NULL)`;
  const recipients = await db.execute<{ user_id: string }>(sql`
    SELECT DISTINCT user_id FROM (
      SELECT follower_id AS user_id FROM follows WHERE followee_id = ${opts.authorId}
      UNION
      SELECT user_id FROM topic_follows WHERE tag IN ${tagsParam}
    ) recipients
    WHERE user_id <> ${opts.authorId}
    LIMIT ${FANOUT_CAP}
  `);
  const rows = recipients.rows as Array<{ user_id: string }>;
  if (rows.length === 0) return;
  await db
    .insert(notifications)
    .values(
      rows.map((r) => ({
        userId: r.user_id,
        kind: "post.published.by_followee" as const,
        payload: { tags: opts.tags },
        postId: opts.postId,
        actorId: opts.authorId,
      })),
    )
    .onConflictDoNothing();
}

export async function notifyClapThreshold(opts: {
  postId: string;
  postAuthorId: string;
  totalClappers: number;
}): Promise<void> {
  // Notify on threshold crossings by distinct-clapper count.
  const threshold = CLAP_THRESHOLDS.find((t) => t === opts.totalClappers);
  if (!threshold) return;
  await db
    .insert(notifications)
    .values({
      userId: opts.postAuthorId,
      kind: thresholdKind(threshold),
      payload: { threshold, baseKind: "claps.received_threshold" },
      postId: opts.postId,
      actorId: null,
    })
    .onConflictDoNothing();
}

export async function distinctClapperCount(postId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(claps)
    .where(eq(claps.postId, postId));
  return row?.n ?? 0;
}

export async function listNotifications(opts: {
  userId: string;
  onlyUnread: boolean;
  limit: number;
  cursor?: string;
}): Promise<{ items: typeof notifications.$inferSelect[]; nextCursor: string | null }> {
  const conds = [eq(notifications.userId, opts.userId)];
  if (opts.onlyUnread) conds.push(isNull(notifications.readAt));
  if (opts.cursor) {
    const d = new Date(opts.cursor);
    if (!Number.isNaN(d.getTime())) conds.push(lt(notifications.createdAt, d));
  }
  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conds))
    .orderBy(desc(notifications.createdAt))
    .limit(opts.limit + 1);
  const hasMore = rows.length > opts.limit;
  const items = rows.slice(0, opts.limit);
  return {
    items,
    nextCursor: hasMore ? items[items.length - 1].createdAt.toISOString() : null,
  };
}

export async function markRead(opts: { userId: string; ids?: string[] }): Promise<number> {
  if (opts.ids && opts.ids.length === 0) return 0;
  const conds = [eq(notifications.userId, opts.userId), isNull(notifications.readAt)];
  if (opts.ids) conds.push(inArray(notifications.id, opts.ids));
  const res = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(...conds))
    .returning({ id: notifications.id });
  return res.length;
}

export async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

