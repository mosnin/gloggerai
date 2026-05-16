import { pgTable, text, timestamp, uuid, integer, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { apiKeys, posts, users } from "@/db/schema";

export const postRevisions = pgTable(
  "post_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    contentMd: text("content_md").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    coverImageUrl: text("cover_image_url"),
    status: text("status").notNull(),
    editedByUserId: uuid("edited_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    editedByApiKeyId: uuid("edited_by_api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    postRevisionUniq: uniqueIndex("post_revisions_post_rev_idx").on(t.postId, t.revisionNumber),
    postIdx: index("post_revisions_post_idx").on(t.postId, t.revisionNumber),
  }),
);

export type PostRevision = typeof postRevisions.$inferSelect;
export type NewPostRevision = typeof postRevisions.$inferInsert;
