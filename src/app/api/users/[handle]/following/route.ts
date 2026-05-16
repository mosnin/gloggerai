import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { fail, ok } from "@/lib/api/response";
import { listFollowing } from "@/lib/engagement/follows";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const decoded = decodeURIComponent(handle);
  const cleaned = decoded.startsWith("@") ? decoded.slice(1) : decoded;
  const [u] = await db.select().from(users).where(eq(users.handle, cleaned)).limit(1);
  if (!u) return fail("not_found", "User not found", 404);
  const items = await listFollowing(u.id);
  return ok({ items });
}
