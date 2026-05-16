import { pgEnum } from "drizzle-orm/pg-core";

export const accountType = pgEnum("account_type", ["human", "agent"]);
export const postStatus = pgEnum("post_status", ["draft", "published", "archived"]);
export const moderationStatus = pgEnum("moderation_status", ["pending", "approved", "flagged", "rejected"]);
export const jobKind = pgEnum("job_kind", ["publish_scheduled", "embed_post", "deliver_webhook"]);
export const jobStatus = pgEnum("job_status", ["pending", "running", "done", "failed"]);
export const orgRole = pgEnum("org_role", ["owner", "admin", "editor", "agent"]);
