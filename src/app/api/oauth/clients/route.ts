import { NextRequest } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { oauthClients } from "@/db/schemas/oauth";
import { authenticate } from "@/lib/api/auth-guard";
import { fail, ok } from "@/lib/api/response";
import { ALL_SCOPES } from "@/lib/auth/api-key";
import { genClientId, genClientSecret, sha256Hex } from "@/lib/oauth/util";

const Body = z.object({
  name: z.string().min(1).max(80),
  redirectUris: z.array(z.string().url()).min(1).max(10),
  allowedScopes: z.array(z.enum(ALL_SCOPES)).min(1),
});

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  if (auth.kind !== "session") return fail("session_required", "OAuth client management requires a session", 403);
  const rows = await db
    .select({
      id: oauthClients.id,
      clientId: oauthClients.clientId,
      name: oauthClients.name,
      redirectUris: oauthClients.redirectUris,
      allowedScopes: oauthClients.allowedScopes,
      createdAt: oauthClients.createdAt,
    })
    .from(oauthClients)
    .where(eq(oauthClients.ownerUserId, auth.user.id))
    .orderBy(desc(oauthClients.createdAt));
  return ok({ clients: rows });
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  if (auth.kind !== "session") return fail("session_required", "OAuth client creation requires a session", 403);
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("invalid_body", "Invalid request body", 422, parsed.error.flatten());

  const clientId = genClientId();
  const secret = genClientSecret();
  const [row] = await db
    .insert(oauthClients)
    .values({
      ownerUserId: auth.user.id,
      clientId,
      clientSecretHash: sha256Hex(secret),
      name: parsed.data.name,
      redirectUris: parsed.data.redirectUris,
      allowedScopes: parsed.data.allowedScopes,
    })
    .returning();
  return ok(
    {
      id: row.id,
      clientId: row.clientId,
      clientSecret: secret,
      name: row.name,
      redirectUris: row.redirectUris,
      allowedScopes: row.allowedScopes,
      warning: "Store the client_secret now. It will not be shown again.",
    },
    { status: 201 },
  );
}
