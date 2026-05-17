import { z } from "zod";
import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { consumePasswordReset } from "@/lib/auth/password-reset";
import { requireCsrf } from "@/lib/api/csrf";

const Body = z.object({
  token: z.string().min(8),
  password: z.string().min(8).max(200),
});

export async function POST(req: NextRequest) {
  const csrf = await requireCsrf(req);
  if (csrf) return csrf;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("invalid_body", "Invalid request body", 422, parsed.error.flatten());
  const ok_ = await consumePasswordReset(parsed.data.token, parsed.data.password);
  if (!ok_) return fail("invalid_token", "Reset token invalid or expired", 400);
  return ok({ ok: true });
}
