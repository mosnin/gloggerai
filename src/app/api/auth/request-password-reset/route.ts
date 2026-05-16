import { z } from "zod";
import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { createPasswordResetForEmail } from "@/lib/auth/password-reset";
import { env } from "@/lib/env";

const Body = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("invalid_body", "Invalid request body", 422);
  const raw = await createPasswordResetForEmail(parsed.data.email);
  if (raw && process.env.NODE_ENV !== "production") {
    const url = `${env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/reset-password?token=${raw}`;
    console.log(`[auth] password reset url for ${parsed.data.email}: ${url}`);
  }
  return ok({ ok: true });
}
