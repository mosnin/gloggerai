import { authenticate } from "@/lib/api/auth-guard";
import { fail, ok } from "@/lib/api/response";
import { createVerificationToken, isEmailVerified } from "@/lib/auth/email-verification";
import { sendVerificationEmail } from "@/lib/email/transactional";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  if (auth.kind !== "session") return fail("session_required", "Sign in required", 403);
  if (await isEmailVerified(auth.user.id)) return ok({ ok: true, alreadyVerified: true });

  const token = await createVerificationToken(auth.user.id);
  const result = await sendVerificationEmail(auth.user.email, token);
  return ok({ ok: true, delivered: result.delivered, provider: result.provider });
}
