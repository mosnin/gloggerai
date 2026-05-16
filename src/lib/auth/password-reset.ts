import { randomBytes, createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { passwordResets } from "@/db/schemas/security";
import { hashPassword } from "./password";

const TTL_HOURS = 1;

function hashToken(t: string): string {
  return createHash("sha256").update(t).digest("hex");
}

export async function createPasswordResetForEmail(email: string): Promise<string | null> {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!user) return null;
  const raw = randomBytes(32).toString("base64url");
  const token = hashToken(raw);
  const expiresAt = new Date(Date.now() + TTL_HOURS * 3_600_000);
  await db.insert(passwordResets).values({ token, userId: user.id, expiresAt });
  return raw;
}

export async function consumePasswordReset(raw: string, newPassword: string): Promise<boolean> {
  const token = hashToken(raw);
  const [row] = await db
    .select()
    .from(passwordResets)
    .where(
      and(
        eq(passwordResets.token, token),
        isNull(passwordResets.usedAt),
        gt(passwordResets.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) return false;
  const passwordHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, row.userId));
  await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.token, token));
  return true;
}
