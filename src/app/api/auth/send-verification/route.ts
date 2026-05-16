import { authenticate } from "@/lib/api/auth-guard";
import { fail, ok } from "@/lib/api/response";
import { createVerificationToken, isEmailVerified } from "@/lib/auth/email-verification";
import { env } from "@/lib/env";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  if (auth.kind !== "session") return fail("session_required", "Sign in required", 403);
  if (await isEmailVerified(auth.user.id)) return ok({ ok: true, alreadyVerified: true });

  const token = await createVerificationToken(auth.user.id);
  const url = `${env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/verify-email?token=${token}`;
  if (process.env.NODE_ENV !== "production") {
    console.log(`[auth] email verification url for ${auth.user.email}: ${url}`);
  }
  return ok({ ok: true });
}
