import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/api/auth-guard";
import { fail, ok } from "@/lib/api/response";
import { addBookmark, listBookmarks } from "@/lib/engagement/bookmarks";

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const Body = z.object({ postId: z.string().uuid() });

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const url = new URL(req.url);
  const parsed = ListQuery.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return fail("invalid_query", "Invalid query parameters", 422, parsed.error.flatten());
  const result = await listBookmarks({ userId: auth.user.id, limit: parsed.data.limit, cursor: parsed.data.cursor });
  return ok(result);
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("invalid_body", "Invalid request body", 422, parsed.error.flatten());
  const result = await addBookmark({ userId: auth.user.id, postId: parsed.data.postId });
  if ("error" in result) return fail("not_found", "Post not found", 404);
  return ok({ ok: true }, { status: 201 });
}
