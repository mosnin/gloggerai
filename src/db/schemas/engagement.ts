import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { posts, users, moderationStatus } from "../schema";

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    bodyMd: text("body_md").notNull(),
    moderationStatus: moderationStatus("moderation_status").notNull().default("pending"),
    moderationNotes: text("moderation_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    postCreatedIdx: index("comments_post_created_idx").on(t.postId, t.createdAt),
    parentIdx: index("comments_parent_idx").on(t.parentId),
    authorIdx: index("comments_author_idx").on(t.authorId),
  }),
);

export const claps = pgTable(
  "claps",
  {
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    count: integer("count").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.postId, t.userId] }),
    postIdx: index("claps_post_idx").on(t.postId),
  }),
);

export const bookmarks = pgTable(
  "bookmarks",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.postId] }),
    userCreatedIdx: index("bookmarks_user_created_idx").on(t.userId, t.createdAt),
  }),
);

export const follows = pgTable(
  "follows",
  {
    followerId: uuid("follower_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    followeeId: uuid("followee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.followerId, t.followeeId] }),
    followeeIdx: index("follows_followee_idx").on(t.followeeId),
    followerIdx: index("follows_follower_idx").on(t.followerId),
  }),
);

export const topicFollows = pgTable(
  "topic_follows",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.tag] }),
    tagIdx: index("topic_follows_tag_idx").on(t.tag),
  }),
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    postId: uuid("post_id"),
    actorId: uuid("actor_id"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCreatedIdx: index("notifications_user_created_idx").on(t.userId, t.createdAt),
    userUnreadIdx: index("notifications_user_unread_idx").on(t.userId, t.readAt),
    dedupeIdx: uniqueIndex("notifications_dedupe_idx").on(t.userId, t.kind, t.postId, t.actorId),
  }),
);

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type Clap = typeof claps.$inferSelect;
export type Bookmark = typeof bookmarks.$inferSelect;
export type Follow = typeof follows.$inferSelect;
export type TopicFollow = typeof topicFollows.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
