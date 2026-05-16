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
import { accountType, postStatus, moderationStatus, jobKind, jobStatus, orgRole } from "./schemas/enums";

export { accountType, postStatus, moderationStatus, jobKind, jobStatus, orgRole };

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
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishAt: timestamp("publish_at", { withTimezone: true }),
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

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: jobKind("kind").notNull(),
    status: jobStatus("status").notNull().default("pending"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    readyIdx: index("jobs_ready_idx").on(t.status, t.runAt),
    kindIdx: index("jobs_kind_idx").on(t.kind),
  }),
);

export const webhooks = pgTable(
  "webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    events: jsonb("events").$type<string[]>().notNull().default([]),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index("webhooks_user_idx").on(t.userId) }),
);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orgMembers = pgTable(
  "org_members",
  {
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: orgRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: uniqueIndex("org_members_pk_idx").on(t.orgId, t.userId),
    userIdx: index("org_members_user_idx").on(t.userId),
  }),
);

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  webhookId: uuid("webhook_id").notNull().references(() => webhooks.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: integer("status"),
  responseBody: text("response_body"),
  attempts: integer("attempts").notNull().default(0),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Webhook = typeof webhooks.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type OrgMember = typeof orgMembers.$inferSelect;

export const postViews = pgTable("post_views", {
  id: integer("id").primaryKey(),
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  referrerHost: text("referrer_host"),
  country: text("country"),
  uaClass: text("ua_class"),
  isBot: boolean("is_bot").notNull().default(false),
  sessionHash: text("session_hash"),
});

export * from "./schemas/security";
export * from "./schemas/oauth";
export * from "./schemas/engagement";
export * from "./schemas/content";
