import { NextRequest } from "next/server";
import { authenticate, requireScope } from "@/lib/api/auth-guard";
import { checkIdempotency, storeIdempotent } from "@/lib/api/idempotency";
import { fail, ok } from "@/lib/api/response";
import { isEmailVerified } from "@/lib/auth/email-verification";
import { updatePost } from "@/lib/posts/service";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const scopeFail = requireScope(auth, "posts:publish");
  if (scopeFail) return scopeFail;
  if (auth.kind === "api_key" && !(await isEmailVerified(auth.user.id))) {
    return fail("email_not_verified", "Verify your email before publishing", 403);
  }

  const apiKeyId = auth.kind === "api_key" ? auth.key.id : null;
  const idemp = await checkIdempotency(req, apiKeyId);
  if (idemp.cached) return idemp.cached;

  const updated = await updatePost({ postId: id, authorId: auth.user.id, input: { status: "published" } });
  if (!updated) return fail("not_found", "Post not found", 404);
  if (updated.status !== "published") {
    return fail("moderation_blocked", "Publish blocked by moderation", 409, { notes: updated.moderationNotes });
  }
  const body = { post: updated };
  if (idemp.key && apiKeyId) await storeIdempotent(idemp.key, apiKeyId, "POST", `/api/posts/${id}/publish`, 200, body);
  return ok(body);
}
