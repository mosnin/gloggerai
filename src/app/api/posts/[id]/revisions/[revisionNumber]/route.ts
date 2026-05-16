import { NextRequest } from "next/server";
import { authenticate, requireScope } from "@/lib/api/auth-guard";
import { fail, ok } from "@/lib/api/response";
import { getPost } from "@/lib/posts/service";
import { getRevision } from "@/lib/posts/revisions";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; revisionNumber: string }> },
) {
  const { id, revisionNumber } = await params;
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const scopeFail = requireScope(auth, "posts:read");
  if (scopeFail) return scopeFail;

  const row = await getPost({ id });
  if (!row) return fail("not_found", "Post not found", 404);
  if (row.post.authorId !== auth.user.id) return fail("not_found", "Post not found", 404);

  const n = Number(revisionNumber);
  if (!Number.isInteger(n) || n < 1) return fail("invalid_revision", "Invalid revision number", 400);

  const rev = await getRevision(id, n);
  if (!rev) return fail("not_found", "Revision not found", 404);
  return ok({ revision: rev });
}
