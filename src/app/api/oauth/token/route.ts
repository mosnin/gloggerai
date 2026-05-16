import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { apiKeys } from "@/db/schema";
import { oauthClients, oauthAuthorizationCodes } from "@/db/schemas/oauth";
import { fail, ok } from "@/lib/api/response";
import { generateApiKey, type Scope } from "@/lib/auth/api-key";
import { compareSecret, sha256Hex, verifyPkce } from "@/lib/oauth/util";

export const dynamic = "force-dynamic";

function tokenError(code: string, description: string, status = 400) {
  return new Response(JSON.stringify({ error: code, error_description: description }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function POST(req: NextRequest) {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/x-www-form-urlencoded") && !ct.includes("multipart/form-data")) {
    return tokenError("invalid_request", "Content-Type must be application/x-www-form-urlencoded");
  }
  const form = await req.formData();
  const grantType = String(form.get("grant_type") ?? "");
  if (grantType !== "authorization_code") return tokenError("unsupported_grant_type", "only authorization_code is supported");

  const code = String(form.get("code") ?? "");
  const clientId = String(form.get("client_id") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const verifier = String(form.get("code_verifier") ?? "");
  const clientSecretFromForm = form.get("client_secret");

  if (!code || !clientId || !redirectUri || !verifier) {
    return tokenError("invalid_request", "code, client_id, redirect_uri, code_verifier required");
  }

  const [client] = await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).limit(1);
  if (!client) return tokenError("invalid_client", "Unknown client_id", 401);

  const authHeader = req.headers.get("authorization");
  let providedSecret: string | null = null;
  if (authHeader?.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = Buffer.from(authHeader.slice(6).trim(), "base64").toString("utf8");
      const idx = decoded.indexOf(":");
      if (idx >= 0) providedSecret = decoded.slice(idx + 1);
    } catch {}
  } else if (typeof clientSecretFromForm === "string") {
    providedSecret = clientSecretFromForm;
  }
  if (!providedSecret || !compareSecret(providedSecret, client.clientSecretHash)) {
    return tokenError("invalid_client", "client_secret mismatch", 401);
  }

  const codeHash = sha256Hex(code);
  const [stored] = await db
    .select()
    .from(oauthAuthorizationCodes)
    .where(eq(oauthAuthorizationCodes.codeHash, codeHash))
    .limit(1);
  if (!stored) return tokenError("invalid_grant", "code not found");
  if (stored.usedAt) return tokenError("invalid_grant", "code already used");
  if (stored.expiresAt < new Date()) return tokenError("invalid_grant", "code expired");
  if (stored.clientId !== clientId) return tokenError("invalid_grant", "client mismatch");
  if (stored.redirectUri !== redirectUri) return tokenError("invalid_grant", "redirect_uri mismatch");
  if (!verifyPkce(verifier, stored.codeChallenge, stored.codeChallengeMethod)) {
    return tokenError("invalid_grant", "PKCE verification failed");
  }

  await db
    .update(oauthAuthorizationCodes)
    .set({ usedAt: new Date() })
    .where(eq(oauthAuthorizationCodes.codeHash, codeHash));

  const granted = stored.scopes as Scope[];
  const { plain, prefix, hash } = generateApiKey();
  const [key] = await db
    .insert(apiKeys)
    .values({
      userId: stored.userId,
      name: `OAuth: ${client.name}`,
      prefix,
      hash,
      scopes: granted,
      rateLimitPerMinute: 60,
    })
    .returning();
  void key;
  return ok(
    {
      access_token: plain,
      token_type: "Bearer",
      scope: granted.join(" "),
      expires_in: null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
