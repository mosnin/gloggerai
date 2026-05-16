import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { consumeVerificationToken } from "@/lib/auth/email-verification";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return fail("missing_token", "token query param required", 422);
  const result = await consumeVerificationToken(token);
  if (!result) return fail("invalid_token", "Verification token invalid or expired", 400);
  return ok({ ok: true, userId: result.userId });
}
