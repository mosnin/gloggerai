import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { ok, fail } from "@/lib/api/response";

const Body = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("invalid_body", "Invalid request body", 422);
  const { email, password } = parsed.data;

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !user.passwordHash) return fail("invalid_credentials", "Invalid email or password", 401);
  const matches = await verifyPassword(user.passwordHash, password);
  if (!matches) return fail("invalid_credentials", "Invalid email or password", 401);

  await createSession(user.id);
  return ok({ user: { id: user.id, email: user.email, handle: user.handle, displayName: user.displayName } });
}
