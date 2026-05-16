import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { authenticate } from "@/lib/api/auth-guard";
import { fail, ok } from "@/lib/api/response";
import { followUser, unfollowUser } from "@/lib/engagement/follows";

async function resolveHandle(raw: string) {
  const decoded = decodeURIComponent(raw);
  const cleaned = decoded.startsWith("@") ? decoded.slice(1) : decoded;
  const [u] = await db.select().from(users).where(eq(users.handle, cleaned)).limit(1);
  return u ?? null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ handle: string }> }) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { handle } = await params;
  const target = await resolveHandle(handle);
  if (!target) return fail("not_found", "User not found", 404);
  const result = await followUser({ followerId: auth.user.id, followeeId: target.id });
  if ("error" in result) return fail("self_follow", "Cannot follow yourself", 422);
  return ok({ ok: true }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ handle: string }> }) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { handle } = await params;
  const target = await resolveHandle(handle);
  if (!target) return fail("not_found", "User not found", 404);
  await unfollowUser({ followerId: auth.user.id, followeeId: target.id });
  return ok({ ok: true });
}
