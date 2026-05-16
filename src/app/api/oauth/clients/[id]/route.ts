import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { oauthClients } from "@/db/schemas/oauth";
import { authenticate } from "@/lib/api/auth-guard";
import { fail, ok } from "@/lib/api/response";
import { genClientSecret, sha256Hex } from "@/lib/oauth/util";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  if (auth.kind !== "session") return fail("session_required", "Session required", 403);
  const res = await db
    .delete(oauthClients)
    .where(and(eq(oauthClients.id, id), eq(oauthClients.ownerUserId, auth.user.id)))
    .returning({ id: oauthClients.id });
  if (!res.length) return fail("not_found", "Client not found", 404);
  return ok({ ok: true, id });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  if (auth.kind !== "session") return fail("session_required", "Session required", 403);
  const url = new URL(req.url);
  if (url.searchParams.get("action") !== "rotate_secret") {
    return fail("unknown_action", "expected ?action=rotate_secret", 400);
  }
  const secret = genClientSecret();
  const [updated] = await db
    .update(oauthClients)
    .set({ clientSecretHash: sha256Hex(secret) })
    .where(and(eq(oauthClients.id, id), eq(oauthClients.ownerUserId, auth.user.id)))
    .returning({ id: oauthClients.id, clientId: oauthClients.clientId });
  if (!updated) return fail("not_found", "Client not found", 404);
  return ok({ id: updated.id, clientId: updated.clientId, clientSecret: secret });
}
