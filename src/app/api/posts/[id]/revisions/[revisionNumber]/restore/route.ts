import { NextRequest } from "next/server";
import { authenticate, requireScope } from "@/lib/api/auth-guard";
import { fail, ok } from "@/lib/api/response";
import { restorePostFromRevision } from "@/lib/posts/service";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; revisionNumber: string }> },
) {
  const { id, revisionNumber } = await params;
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const scopeFail = requireScope(auth, "posts:write");
  if (scopeFail) return scopeFail;

  const n = Number(revisionNumber);
  if (!Number.isInteger(n) || n < 1) return fail("invalid_revision", "Invalid revision number", 400);

  const updated = await restorePostFromRevision({
    postId: id,
    authorId: auth.user.id,
    revisionNumber: n,
    apiKeyId: auth.kind === "api_key" ? auth.key.id : null,
  });
  if (!updated) return fail("not_found", "Post or revision not found", 404);
  return ok({ post: updated });
}
