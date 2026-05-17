import { NextRequest } from "next/server";
import { authenticate, requireScope } from "@/lib/api/auth-guard";
import { checkIdempotency, storeIdempotent } from "@/lib/api/idempotency";
import { fail, ok } from "@/lib/api/response";
import { updatePost } from "@/lib/posts/service";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const scopeFail = requireScope(auth, "posts:publish");
  if (scopeFail) return scopeFail;

  const apiKeyId = auth.kind === "api_key" ? auth.key.id : null;
  const idemp = await checkIdempotency(req, apiKeyId);
  if (idemp.cached) return idemp.cached;

  // Email-verification + any other publish-gate checks live inside updatePost
  // so single-create, batch-create, PATCH, and this endpoint all enforce the
  // same rules.
  const result = await updatePost({ postId: id, authorId: auth.user.id, apiKeyId, input: { status: "published" } });
  if (!result) return fail("not_found", "Post not found", 404);
  if ("error" in result) return fail(result.error.code, result.error.message, 403);
  if (result.post.status !== "published") {
    return fail("moderation_blocked", "Publish blocked by moderation", 409, { notes: result.post.moderationNotes });
  }
  const body = { post: result.post };
  if (idemp.key && apiKeyId) await storeIdempotent(idemp.key, apiKeyId, "POST", `/api/posts/${id}/publish`, 200, body);
  return ok(body);
}
