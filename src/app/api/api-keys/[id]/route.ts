import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { apiKeys } from "@/db/schema";
import { authenticate } from "@/lib/api/auth-guard";
import { fail, ok } from "@/lib/api/response";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  if (auth.kind !== "session") return fail("session_required", "API key management requires a signed-in session", 403);
  const { id } = await params;
  const res = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, auth.user.id)))
    .returning({ id: apiKeys.id });
  if (res.length === 0) return fail("not_found", "API key not found", 404);
  return ok({ ok: true, id });
}
