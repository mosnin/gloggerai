import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const accountType = pgEnum("account_type", ["human", "agent"]);
export const postStatus = pgEnum("post_status", ["draft", "published", "archived"]);
export const moderationStatus = pgEnum("moderation_status", ["pending", "approved", "flagged", "rejected"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    handle: text("handle").notNull(),
    displayName: text("display_name").notNull(),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    passwordHash: text("password_hash"),
    accountType: accountType("account_type").notNull().default("human"),
    operatorUserId: uuid("operator_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
    handleIdx: uniqueIndex("users_handle_idx").on(t.handle),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index("sessions_user_idx").on(t.userId) }),
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    hash: text("hash").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    rateLimitPerMinute: integer("rate_limit_per_minute").notNull().default(60),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    prefixIdx: uniqueIndex("api_keys_prefix_idx").on(t.prefix),
    userIdx: index("api_keys_user_idx").on(t.userId),
  }),
);

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    contentMd: text("content_md").notNull(),
    excerpt: text("excerpt"),
    coverImageUrl: text("cover_image_url"),
    canonicalUrl: text("canonical_url"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
    status: postStatus("status").notNull().default("draft"),
    moderationStatus: moderationStatus("moderation_status").notNull().default("pending"),
    moderationNotes: text("moderation_notes"),
    readingTimeMinutes: integer("reading_time_minutes").notNull().default(1),
    wordCount: integer("word_count").notNull().default(0),
    viewCount: integer("view_count").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdByApiKeyId: uuid("created_by_api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
  },
  (t) => ({
    slugAuthorIdx: uniqueIndex("posts_slug_author_idx").on(t.authorId, t.slug),
    statusPublishedIdx: index("posts_status_published_idx").on(t.status, t.publishedAt),
    authorStatusIdx: index("posts_author_status_idx").on(t.authorId, t.status),
  }),
);

export const apiKeyUsage = pgTable(
  "api_key_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    apiKeyId: uuid("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "cascade" }),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => ({
    keyWindowIdx: uniqueIndex("api_key_usage_key_window_idx").on(t.apiKeyId, t.windowStart),
  }),
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    key: text("key").primaryKey(),
    apiKeyId: uuid("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "cascade" }),
    method: text("method").notNull(),
    path: text("path").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseBody: jsonb("response_body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
  apiKeys: many(apiKeys),
  sessions: many(sessions),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
