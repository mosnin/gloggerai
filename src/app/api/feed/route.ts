import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api/response";
import { getFeed } from "@/lib/engagement/feed";

const Query = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return fail("invalid_query", "Invalid query parameters", 422, parsed.error.flatten());
  const user = await getCurrentUser().catch(() => null);
  const result = await getFeed({
    userId: user?.id ?? null,
    limit: parsed.data.limit,
    cursor: parsed.data.cursor,
  });
  return ok(result);
}
