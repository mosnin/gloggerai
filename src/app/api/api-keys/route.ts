import { NextRequest } from "next/server";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { apiKeys } from "@/db/schema";
import { authenticate } from "@/lib/api/auth-guard";
import { requireCsrf } from "@/lib/api/csrf";
import { ok, fail } from "@/lib/api/response";
import { ALL_SCOPES, generateApiKey } from "@/lib/auth/api-key";

const CreateBody = z.object({
  name: z.string().min(1).max(80),
  scopes: z.array(z.enum(ALL_SCOPES)).min(1),
  rateLimitPerMinute: z.number().int().min(1).max(10_000).default(60),
});

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  if (auth.kind !== "session") return fail("session_required", "API key management requires a signed-in session", 403);

  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      scopes: apiKeys.scopes,
      rateLimitPerMinute: apiKeys.rateLimitPerMinute,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, auth.user.id), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));
  return ok({ apiKeys: rows });
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  if (auth.kind !== "session") return fail("session_required", "API key creation requires a signed-in session", 403);
  const csrf = await requireCsrf(req);
  if (csrf) return csrf;

  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("invalid_body", "Invalid request body", 422, parsed.error.flatten());

  const { plain, prefix, hash } = generateApiKey();
  const [row] = await db
    .insert(apiKeys)
    .values({
      userId: auth.user.id,
      name: parsed.data.name,
      prefix,
      hash,
      scopes: parsed.data.scopes,
      rateLimitPerMinute: parsed.data.rateLimitPerMinute,
    })
    .returning();

  return ok(
    {
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      scopes: row.scopes,
      rateLimitPerMinute: row.rateLimitPerMinute,
      key: plain,
      warning: "Store this key now. It will not be shown again.",
    },
    { status: 201 },
  );
}
