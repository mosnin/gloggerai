/**
 * End-to-end engagement tests against a real Postgres. Skipped silently when
 * INTEGRATION_DATABASE_URL is unset, so they don't fail unit-only runs.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createTestPost,
  createTestUser,
  ensureSchema,
  integrationDbUrl,
  purgeAll,
  shutdownPool,
} from "./setup";

const suite = integrationDbUrl ? describe : describe.skip;

beforeAll(async () => {
  if (!integrationDbUrl) return;
  process.env.DATABASE_URL = integrationDbUrl;
  process.env.SESSION_SECRET ??= "x".repeat(40);
  await ensureSchema();
});

beforeEach(async () => {
  if (integrationDbUrl) await purgeAll();
});

afterAll(async () => {
  await shutdownPool();
});

suite("engagement integration", () => {
  it("claps: upsert respects 1-50 bounds and updates denormalized total", async () => {
    const { upsertClap, getClapState } = await import("@/lib/engagement/claps");
    const author = await createTestUser();
    const reader1 = await createTestUser();
    const reader2 = await createTestUser();
    const post = await createTestPost(author.id);

    await expect(upsertClap({ postId: post.id, userId: reader1.id, count: 0 })).rejects.toThrow();
    await expect(upsertClap({ postId: post.id, userId: reader1.id, count: 51 })).rejects.toThrow();

    const a = await upsertClap({ postId: post.id, userId: reader1.id, count: 5 });
    expect(a.total).toBe(5);

    const b = await upsertClap({ postId: post.id, userId: reader2.id, count: 7 });
    expect(b.total).toBe(12);

    // Same user updates (not increments) their own count.
    const c = await upsertClap({ postId: post.id, userId: reader1.id, count: 50 });
    expect(c.total).toBe(57);

    const state = await getClapState({ postId: post.id, userId: reader1.id });
    expect(state).toEqual({ total: 57, mine: 50 });

    const anon = await getClapState({ postId: post.id });
    expect(anon).toEqual({ total: 57, mine: 0 });
  });

  it("comments: top-level create, 1-level reply, deep nesting rejected", async () => {
    const { createComment, listCommentsForPost, listReplies } = await import("@/lib/engagement/comments");
    const author = await createTestUser();
    const commenter = await createTestUser();
    const post = await createTestPost(author.id);

    const top = await createComment({ postId: post.id, authorId: commenter.id, bodyMd: "first" });
    if (!("comment" in top) || !top.comment) throw new Error("expected comment");
    const topId = top.comment.id;

    const reply = await createComment({
      postId: post.id,
      authorId: commenter.id,
      bodyMd: "reply",
      parentId: topId,
    });
    if (!("comment" in reply) || !reply.comment) throw new Error("expected reply");
    const replyId = reply.comment.id;

    const deep = await createComment({
      postId: post.id,
      authorId: commenter.id,
      bodyMd: "deeper",
      parentId: replyId,
    });
    expect(deep).toEqual({ error: "nesting_too_deep" });

    const list = await listCommentsForPost({ postId: post.id, limit: 10 });
    expect(list.items).toHaveLength(1);
    expect(list.items[0].replyCount).toBe(1);

    const replies = await listReplies({ parentId: topId, limit: 10 });
    expect(replies).toHaveLength(1);
    expect(replies[0].bodyMd).toBe("reply");
  });

  it("comments: rejects on a draft post", async () => {
    const { createComment } = await import("@/lib/engagement/comments");
    const author = await createTestUser();
    const commenter = await createTestUser();
    const post = await createTestPost(author.id, { status: "draft" });
    const res = await createComment({ postId: post.id, authorId: commenter.id, bodyMd: "hi" });
    expect(res).toEqual({ error: "post_not_found" });
  });

  it("bookmarks: add → list → remove round-trip", async () => {
    const { addBookmark, removeBookmark, isBookmarked, listBookmarks } = await import("@/lib/engagement/bookmarks");
    const author = await createTestUser();
    const reader = await createTestUser();
    const a = await createTestPost(author.id);
    const b = await createTestPost(author.id);

    expect(await isBookmarked({ userId: reader.id, postId: a.id })).toBe(false);
    await addBookmark({ userId: reader.id, postId: a.id });
    await addBookmark({ userId: reader.id, postId: a.id }); // dedupe
    await addBookmark({ userId: reader.id, postId: b.id });

    expect(await isBookmarked({ userId: reader.id, postId: a.id })).toBe(true);

    const list = await listBookmarks({ userId: reader.id, limit: 10 });
    expect(list.items).toHaveLength(2);

    await removeBookmark({ userId: reader.id, postId: a.id });
    expect(await isBookmarked({ userId: reader.id, postId: a.id })).toBe(false);
    const after = await listBookmarks({ userId: reader.id, limit: 10 });
    expect(after.items).toHaveLength(1);
  });

  it("follows: user follow + counts + topic follow", async () => {
    const { followUser, unfollowUser, isFollowing, followCounts, followTopic, unfollowTopic } = await import(
      "@/lib/engagement/follows"
    );
    const a = await createTestUser();
    const b = await createTestUser();
    const c = await createTestUser();

    expect(await isFollowing({ followerId: a.id, followeeId: b.id })).toBe(false);
    await followUser({ followerId: a.id, followeeId: b.id });
    await followUser({ followerId: c.id, followeeId: b.id });
    expect(await isFollowing({ followerId: a.id, followeeId: b.id })).toBe(true);

    const counts = await followCounts(b.id);
    expect(counts).toEqual({ followers: 2, following: 0 });

    await unfollowUser({ followerId: a.id, followeeId: b.id });
    expect((await followCounts(b.id)).followers).toBe(1);

    await followTopic({ userId: a.id, tag: "postgres" });
    await followTopic({ userId: a.id, tag: "postgres" }); // dedupe
    await unfollowTopic({ userId: a.id, tag: "postgres" });
  });

  it("notifications: comment fan-out + post-publish fan-out + mark-read", async () => {
    const { createComment } = await import("@/lib/engagement/comments");
    const { followUser, followTopic } = await import("@/lib/engagement/follows");
    const { notifyPostPublished, listNotifications, unreadCount, markRead } = await import(
      "@/lib/engagement/notifications"
    );

    const author = await createTestUser();
    const follower = await createTestUser();
    const topicFollower = await createTestUser();
    const commenter = await createTestUser();

    await followUser({ followerId: follower.id, followeeId: author.id });
    await followTopic({ userId: topicFollower.id, tag: "ai" });

    const post = await createTestPost(author.id, { tags: ["ai"] });

    // Comment by someone else should notify the post author.
    await createComment({ postId: post.id, authorId: commenter.id, bodyMd: "neat" });
    expect(await unreadCount(author.id)).toBe(1);

    // Self-comment should NOT notify.
    await createComment({ postId: post.id, authorId: author.id, bodyMd: "thanks" });
    expect(await unreadCount(author.id)).toBe(1);

    // Post-publish fan-out: notifies user-follower AND topic-follower, dedupes,
    // and skips the author.
    await notifyPostPublished({ postId: post.id, authorId: author.id, tags: ["ai"] });
    expect(await unreadCount(follower.id)).toBe(1);
    expect(await unreadCount(topicFollower.id)).toBe(1);
    expect(await unreadCount(author.id)).toBe(1); // unchanged

    // Mark read: per-id and all.
    const list = await listNotifications({ userId: follower.id, onlyUnread: true, limit: 10 });
    expect(list.items).toHaveLength(1);
    const n = await markRead({ userId: follower.id, ids: [list.items[0].id] });
    expect(n).toBe(1);
    expect(await unreadCount(follower.id)).toBe(0);

    const all = await markRead({ userId: author.id });
    expect(all).toBeGreaterThan(0);
    expect(await unreadCount(author.id)).toBe(0);
  });

  it("feed: anonymous returns latest published, authed mixes followees + topics + global", async () => {
    const { getFeed } = await import("@/lib/engagement/feed");
    const { followUser, followTopic } = await import("@/lib/engagement/follows");

    const me = await createTestUser();
    const followee = await createTestUser();
    const stranger = await createTestUser();

    await createTestPost(followee.id, { tags: ["news"] });
    await createTestPost(followee.id, { tags: [] });
    await createTestPost(stranger.id, { tags: ["postgres"] });
    await createTestPost(stranger.id, { tags: [] });

    const anon = await getFeed({ userId: null, limit: 10 });
    expect(anon.items.length).toBeGreaterThanOrEqual(4);
    for (const i of anon.items) expect(i.source).toBe("global");

    await followUser({ followerId: me.id, followeeId: followee.id });
    await followTopic({ userId: me.id, tag: "postgres" });

    const mine = await getFeed({ userId: me.id, limit: 10 });
    const sources = new Set(mine.items.map((i) => i.source));
    // Should now include followee or topic posts in addition to global.
    expect(sources.has("followee") || sources.has("topic")).toBe(true);
    // No duplicate post ids in the merge.
    const ids = mine.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
