import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { slug } from "@/lib/utils";

export async function uniqueHandle(seed: string): Promise<string> {
  const base = slug(seed) || "user";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i}`;
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.handle, candidate)).limit(1);
    if (existing.length === 0) return candidate;
  }
  return `${base}-${Date.now()}`;
}
