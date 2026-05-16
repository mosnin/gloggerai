import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { uniqueHandle } from "@/lib/auth/handle";
import { ok, fail } from "@/lib/api/response";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(80),
  accountType: z.enum(["human", "agent"]).default("human"),
});

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("invalid_body", "Invalid request body", 422, parsed.error.flatten());
  const { email, password, displayName, accountType } = parsed.data;

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) return fail("email_taken", "Email already registered", 409);

  const handle = await uniqueHandle(displayName);
  const passwordHash = await hashPassword(password);

  const [user] = await db
    .insert(users)
    .values({ email, displayName, handle, accountType, passwordHash })
    .returning();

  await createSession(user.id);
  return ok({ user: { id: user.id, email: user.email, handle: user.handle, displayName: user.displayName } });
}
