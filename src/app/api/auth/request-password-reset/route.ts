import { z } from "zod";
import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { createPasswordResetForEmail } from "@/lib/auth/password-reset";
import { sendPasswordResetEmail } from "@/lib/email/transactional";
import { requireCsrf } from "@/lib/api/csrf";

const Body = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  const csrf = await requireCsrf(req);
  if (csrf) return csrf;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("invalid_body", "Invalid request body", 422);
  const raw = await createPasswordResetForEmail(parsed.data.email);
  if (raw) await sendPasswordResetEmail(parsed.data.email, raw);
  // Always 200 to prevent email enumeration.
  return ok({ ok: true });
}
