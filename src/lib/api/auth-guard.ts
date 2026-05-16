import type { NextRequest } from "next/server";
import { authenticateApiKey, consumeRateLimit, hasScope, type AuthedKey, type Scope } from "@/lib/auth/api-key";
import { getCurrentUser } from "@/lib/auth/session";
import { fail } from "./response";
import type { User } from "@/db/schema";

export type Authed =
  | { kind: "session"; user: User; key: null }
  | { kind: "api_key"; user: User; key: AuthedKey["key"] };

function extractBearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const [scheme, token] = h.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

export async function authenticate(req: NextRequest): Promise<Authed | Response> {
  const bearer = extractBearer(req);
  if (bearer) {
    const result = await authenticateApiKey(bearer);
    if (!result) return fail("invalid_api_key", "API key is invalid or revoked", 401);
    const rl = await consumeRateLimit(result.key);
    if (!rl.ok) {
      return new Response(JSON.stringify({ error: { code: "rate_limited", message: "rate limit exceeded" } }), {
        status: 429,
        headers: {
          "content-type": "application/json",
          "x-ratelimit-limit": String(result.key.rateLimitPerMinute),
          "x-ratelimit-remaining": "0",
          "retry-after": "60",
        },
      });
    }
    return { kind: "api_key", user: result.user, key: result.key };
  }
  const user = await getCurrentUser();
  if (!user) return fail("unauthenticated", "Provide a Bearer API key or sign in", 401);
  return { kind: "session", user, key: null };
}

export function requireScope(auth: Authed, scope: Scope): Response | null {
  if (auth.kind === "session") return null;
  if (!hasScope(auth.key, scope)) {
    return fail("missing_scope", `API key lacks required scope: ${scope}`, 403);
  }
  return null;
}
