import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { authenticate } from "@/lib/api/auth-guard";
import { requireCsrf } from "@/lib/api/csrf";
import { fail, ok } from "@/lib/api/response";
import { destroySession } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  return ok({
    id: auth.user.id,
    email: auth.user.email,
    handle: auth.user.handle,
    displayName: auth.user.displayName,
    accountType: auth.user.accountType,
    via: auth.kind,
  });
}

const DeleteBody = z.object({ confirm: z.literal("DELETE_MY_ACCOUNT") });

export async function DELETE(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  if (auth.kind !== "session") return fail("session_required", "Account deletion requires a signed-in session", 403);
  const csrf = await requireCsrf(req);
  if (csrf) return csrf;
  const parsed = DeleteBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return fail("confirm_required", "Body must include confirm: DELETE_MY_ACCOUNT", 422);
  }
  await db.delete(users).where(eq(users.id, auth.user.id));
  await destroySession();
  return ok({ ok: true });
}
