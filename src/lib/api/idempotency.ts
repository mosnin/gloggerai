import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { idempotencyKeys } from "@/db/schema";

export async function checkIdempotency(
  reqOrKey: NextRequest | string | null,
  apiKeyId: string | null,
) {
  if (!apiKeyId) return { key: null, cached: null };
  const key =
    typeof reqOrKey === "string"
      ? reqOrKey
      : reqOrKey
        ? reqOrKey.headers.get("idempotency-key")
        : null;
  if (!key) return { key: null, cached: null };
  // Lookup is per-(api_key_id, key) so two API keys submitting the same string
  // don't see each other's cached responses.
  const [hit] = await db
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.apiKeyId, apiKeyId), eq(idempotencyKeys.key, key)))
    .limit(1);
  if (!hit) return { key, cached: null };
  return {
    key,
    cached: new Response(JSON.stringify(hit.responseBody), {
      status: hit.responseStatus,
      headers: { "content-type": "application/json", "idempotent-replay": "true" },
    }),
  };
}

export async function storeIdempotent(
  key: string,
  apiKeyId: string,
  method: string,
  path: string,
  status: number,
  body: unknown,
) {
  await db
    .insert(idempotencyKeys)
    .values({ key, apiKeyId, method, path, responseStatus: status, responseBody: body as never })
    .onConflictDoNothing();
}
