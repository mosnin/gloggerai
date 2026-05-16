import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { follows, topicFollows } from "@/db/schemas/engagement";
import { users } from "@/db/schema";

export async function followUser(opts: { followerId: string; followeeId: string }) {
  if (opts.followerId === opts.followeeId) return { error: "self_follow" as const };
  await db
    .insert(follows)
    .values({ followerId: opts.followerId, followeeId: opts.followeeId })
    .onConflictDoNothing();
  return { ok: true as const };
}

export async function unfollowUser(opts: { followerId: string; followeeId: string }) {
  await db
    .delete(follows)
    .where(and(eq(follows.followerId, opts.followerId), eq(follows.followeeId, opts.followeeId)));
}

export async function isFollowing(opts: { followerId: string; followeeId: string }): Promise<boolean> {
  const [row] = await db
    .select({ f: follows.followerId })
    .from(follows)
    .where(and(eq(follows.followerId, opts.followerId), eq(follows.followeeId, opts.followeeId)))
    .limit(1);
  return !!row;
}

export async function listFollowers(followeeId: string) {
  return db
    .select({
      id: users.id,
      handle: users.handle,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      since: follows.createdAt,
    })
    .from(follows)
    .innerJoin(users, eq(users.id, follows.followerId))
    .where(eq(follows.followeeId, followeeId))
    .orderBy(desc(follows.createdAt))
    .limit(200);
}

export async function listFollowing(followerId: string) {
  return db
    .select({
      id: users.id,
      handle: users.handle,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      since: follows.createdAt,
    })
    .from(follows)
    .innerJoin(users, eq(users.id, follows.followeeId))
    .where(eq(follows.followerId, followerId))
    .orderBy(desc(follows.createdAt))
    .limit(200);
}

export async function followCounts(userId: string): Promise<{ followers: number; following: number }> {
  const [f1] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(follows)
    .where(eq(follows.followeeId, userId));
  const [f2] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(follows)
    .where(eq(follows.followerId, userId));
  return { followers: f1?.n ?? 0, following: f2?.n ?? 0 };
}

export async function followTopic(opts: { userId: string; tag: string }) {
  await db
    .insert(topicFollows)
    .values({ userId: opts.userId, tag: opts.tag })
    .onConflictDoNothing();
}

export async function unfollowTopic(opts: { userId: string; tag: string }) {
  await db
    .delete(topicFollows)
    .where(and(eq(topicFollows.userId, opts.userId), eq(topicFollows.tag, opts.tag)));
}
