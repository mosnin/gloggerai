import { NextRequest } from "next/server";
import { authenticate, requireScope } from "@/lib/api/auth-guard";
import { checkIdempotency, storeIdempotent } from "@/lib/api/idempotency";
import { fail, ok } from "@/lib/api/response";
import { PostUpdate } from "@/lib/posts/schema";
import { deletePost, getPost, updatePost } from "@/lib/posts/service";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getPost({ id });
  if (!row) return fail("not_found", "Post not found", 404);

  if (row.post.status !== "published") {
    const auth = await authenticate(req);
    if (auth instanceof Response) return auth;
    if (auth.user.id !== row.post.authorId) return fail("not_found", "Post not found", 404);
  }
  return ok({ post: row.post, author: { handle: row.author.handle, displayName: row.author.displayName } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const scopeFail = requireScope(auth, "posts:write");
  if (scopeFail) return scopeFail;

  const apiKeyId = auth.kind === "api_key" ? auth.key.id : null;
  const idemp = await checkIdempotency(req, apiKeyId);
  if (idemp.cached) return idemp.cached;

  const parsed = PostUpdate.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("invalid_body", "Invalid request body", 422, parsed.error.flatten());

  if (parsed.data.status === "published" && auth.kind === "api_key") {
    const publishFail = requireScope(auth, "posts:publish");
    if (publishFail) return publishFail;
  }

  const updated = await updatePost({ postId: id, authorId: auth.user.id, input: parsed.data });
  if (!updated) return fail("not_found", "Post not found", 404);
  const body = { post: updated };
  if (idemp.key && apiKeyId) await storeIdempotent(idemp.key, apiKeyId, "PATCH", `/api/posts/${id}`, 200, body);
  return ok(body);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const scopeFail = requireScope(auth, "posts:delete");
  if (scopeFail) return scopeFail;

  const apiKeyId = auth.kind === "api_key" ? auth.key.id : null;
  const idemp = await checkIdempotency(req, apiKeyId);
  if (idemp.cached) return idemp.cached;

  const removed = await deletePost(id, auth.user.id);
  if (!removed) return fail("not_found", "Post not found", 404);
  const body = { ok: true, id };
  if (idemp.key && apiKeyId) await storeIdempotent(idemp.key, apiKeyId, "DELETE", `/api/posts/${id}`, 200, body);
  return ok(body);
}
