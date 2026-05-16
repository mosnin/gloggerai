import { NextRequest } from "next/server";
import { authenticate, requireScope } from "@/lib/api/auth-guard";
import { checkIdempotency, storeIdempotent } from "@/lib/api/idempotency";
import { ok, fail } from "@/lib/api/response";
import { PostCreate, PostListQuery } from "@/lib/posts/schema";
import { createPost, listPosts } from "@/lib/posts/service";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = PostListQuery.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return fail("invalid_query", "Invalid query parameters", 422, parsed.error.flatten());

  const auth = await authenticate(req).catch(() => null);
  const requestedStatus = parsed.data.status;
  const isAuthed = auth && !(auth instanceof Response);

  if (requestedStatus && requestedStatus !== "published" && !isAuthed) {
    return fail("unauthenticated", "Authenticate to list non-published posts", 401);
  }

  const result = await listPosts({
    status: requestedStatus ?? "published",
    authorHandle: parsed.data.authorHandle,
    tag: parsed.data.tag,
    q: parsed.data.q,
    limit: parsed.data.limit,
    cursor: parsed.data.cursor,
  });
  return ok(result);
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const scopeFail = requireScope(auth, "posts:write");
  if (scopeFail) return scopeFail;

  const idemp = await checkIdempotency(req, auth.kind === "api_key" ? auth.key.id : null);
  if (idemp.cached) return idemp.cached;

  const parsed = PostCreate.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("invalid_body", "Invalid request body", 422, parsed.error.flatten());

  if (parsed.data.status === "published" && auth.kind === "api_key") {
    const publishFail = requireScope(auth, "posts:publish");
    if (publishFail) return publishFail;
  }

  const post = await createPost({
    authorId: auth.user.id,
    apiKeyId: auth.kind === "api_key" ? auth.key.id : null,
    input: parsed.data,
  });

  const body = { post };
  const status = 201;
  if (idemp.key && auth.kind === "api_key") {
    await storeIdempotent(idemp.key, auth.key.id, "POST", "/api/posts", status, body);
  }
  return ok(body, { status });
}
