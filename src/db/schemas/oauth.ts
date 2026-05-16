import { pgTable, text, timestamp, uuid, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "@/db/schema";

export const oauthClients = pgTable(
  "oauth_clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull().unique(),
    clientSecretHash: text("client_secret_hash").notNull(),
    name: text("name").notNull(),
    redirectUris: jsonb("redirect_uris").$type<string[]>().notNull().default([]),
    allowedScopes: jsonb("allowed_scopes").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ ownerIdx: index("oauth_clients_owner_idx").on(t.ownerUserId) }),
);

export const oauthAuthorizationCodes = pgTable(
  "oauth_authorization_codes",
  {
    codeHash: text("code_hash").primaryKey(),
    clientId: text("client_id").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    redirectUri: text("redirect_uri").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    codeChallengeMethod: text("code_challenge_method").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => ({ userIdx: index("oauth_codes_user_idx").on(t.userId) }),
);

export type OauthClient = typeof oauthClients.$inferSelect;
export type OauthAuthorizationCode = typeof oauthAuthorizationCodes.$inferSelect;
