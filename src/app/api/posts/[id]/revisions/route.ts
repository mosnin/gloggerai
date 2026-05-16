import { NextRequest } from "next/server";
import { authenticate, requireScope } from "@/lib/api/auth-guard";
import { fail, ok } from "@/lib/api/response";
import { getPost } from "@/lib/posts/service";
import { listRevisions } from "@/lib/posts/revisions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const scopeFail = requireScope(auth, "posts:read");
  if (scopeFail) return scopeFail;

  const row = await getPost({ id });
  if (!row) return fail("not_found", "Post not found", 404);
  if (row.post.authorId !== auth.user.id) return fail("not_found", "Post not found", 404);

  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const result = await listRevisions({ postId: id, limit, cursor });
  return ok(result);
}
