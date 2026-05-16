import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { users } from "@/db/schema";

export const emailVerifications = pgTable(
  "email_verifications",
  {
    token: text("token").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index("email_verifications_user_idx").on(t.userId) }),
);

export const passwordResets = pgTable(
  "password_resets",
  {
    token: text("token").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index("password_resets_user_idx").on(t.userId) }),
);

export type EmailVerification = typeof emailVerifications.$inferSelect;
export type PasswordReset = typeof passwordResets.$inferSelect;
