import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { eq, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { sessions, users } from "@/db/schema";

const COOKIE = "glogger_session";
const TTL_DAYS = 30;

function token(): string {
  return randomBytes(32).toString("base64url");
}

function fingerprint(t: string): string {
  return createHash("sha256").update(t).digest("hex");
}

export async function createSession(userId: string): Promise<string> {
  const raw = token();
  const id = fingerprint(raw);
  const expiresAt = new Date(Date.now() + TTL_DAYS * 86_400_000);
  await db.insert(sessions).values({ id, userId, expiresAt });
  const jar = await cookies();
  jar.set(COOKIE, raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return raw;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (raw) await db.delete(sessions).where(eq(sessions.id, fingerprint(raw)));
  jar.delete(COOKIE);
}

export async function getCurrentUser() {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  const id = fingerprint(raw);
  const rows = await db
    .select({ user: users, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.session.expiresAt < new Date()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  return row.user;
}

export async function purgeExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
