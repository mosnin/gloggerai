import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { apiKeys, apiKeyUsage, users, type ApiKey, type User } from "@/db/schema";

export const ALL_SCOPES = [
  "posts:read",
  "posts:write",
  "posts:publish",
  "posts:delete",
  "profile:read",
  "profile:write",
  "comments:write",
] as const;
export type Scope = (typeof ALL_SCOPES)[number];

const PREFIX_HUMAN = "glg_live_";

export function generateApiKey(): { plain: string; prefix: string; hash: string } {
  const random = randomBytes(24).toString("base64url");
  const plain = `${PREFIX_HUMAN}${random}`;
  const prefix = plain.slice(0, 16);
  const hash = createHash("sha256").update(plain).digest("hex");
  return { plain, prefix, hash };
}

function hashOf(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

export type AuthedKey = { key: ApiKey; user: User };

export async function authenticateApiKey(plain: string): Promise<AuthedKey | null> {
  if (!plain.startsWith(PREFIX_HUMAN)) return null;
  const prefix = plain.slice(0, 16);
  const rows = await db
    .select({ key: apiKeys, user: users })
    .from(apiKeys)
    .innerJoin(users, eq(users.id, apiKeys.userId))
    .where(and(eq(apiKeys.prefix, prefix), isNull(apiKeys.revokedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const candidate = Buffer.from(hashOf(plain), "hex");
  const stored = Buffer.from(row.key.hash, "hex");
  if (candidate.length !== stored.length || !timingSafeEqual(candidate, stored)) return null;
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.key.id))
    .execute()
    .catch(() => {});
  return row;
}

export function hasScope(key: ApiKey, needed: Scope): boolean {
  return key.scopes.includes(needed);
}

/** Sliding-window-ish per-minute counter. Postgres only — swap to Redis at scale. */
export async function consumeRateLimit(key: ApiKey): Promise<{ ok: boolean; remaining: number }> {
  const limit = key.rateLimitPerMinute;
  const windowStart = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const result = await db
    .insert(apiKeyUsage)
    .values({ apiKeyId: key.id, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [apiKeyUsage.apiKeyId, apiKeyUsage.windowStart],
      set: { count: sql`${apiKeyUsage.count} + 1` },
    })
    .returning({ count: apiKeyUsage.count });
  const count = result[0]?.count ?? 1;
  return { ok: count <= limit, remaining: Math.max(0, limit - count) };
}
