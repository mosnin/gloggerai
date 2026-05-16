import { randomBytes, createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { emailVerifications } from "@/db/schemas/security";
import { eq, and, isNull, gt } from "drizzle-orm";

const TTL_HOURS = 24;

function hashToken(t: string): string {
  return createHash("sha256").update(t).digest("hex");
}

export async function createVerificationToken(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const token = hashToken(raw);
  const expiresAt = new Date(Date.now() + TTL_HOURS * 3_600_000);
  await db.insert(emailVerifications).values({ token, userId, expiresAt });
  return raw;
}

export async function consumeVerificationToken(raw: string): Promise<{ userId: string } | null> {
  const token = hashToken(raw);
  const [row] = await db
    .select()
    .from(emailVerifications)
    .where(
      and(
        eq(emailVerifications.token, token),
        isNull(emailVerifications.usedAt),
        gt(emailVerifications.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) return null;
  await db
    .update(emailVerifications)
    .set({ usedAt: new Date() })
    .where(eq(emailVerifications.token, token));
  await db.execute(sql`UPDATE users SET email_verified_at = now() WHERE id = ${row.userId}`);
  return { userId: row.userId };
}

export async function isEmailVerified(userId: string): Promise<boolean> {
  const res = await db.execute(
    sql`SELECT email_verified_at FROM users WHERE id = ${userId} LIMIT 1`,
  );
  const row = res.rows[0] as { email_verified_at: Date | string | null } | undefined;
  return !!row?.email_verified_at;
}
