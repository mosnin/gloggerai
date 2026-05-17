import { NextRequest } from "next/server";
import { authenticate, requireScope } from "@/lib/api/auth-guard";
import { checkIdempotency, storeIdempotent } from "@/lib/api/idempotency";
import { checkDailyPostLimit } from "@/lib/api/abuse";
import { releasePostReservation, requireFeature, reservePostQuota } from "@/lib/billing/service";
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

  const limit = await checkDailyPostLimit(auth.user.id);
  if (!limit.ok) {
    return fail("daily_limit_exceeded", `Author capped at ${limit.cap} posts per day`, 429, { used: limit.used });
  }

  if (parsed.data.publishAt) {
    const feat = await requireFeature(auth.user.id, "scheduledPublishing");
    if (!feat.ok) return fail("plan_feature_required", feat.reason, 402);
  }

  // Reserve quota atomically BEFORE the insert. If createPost throws or the
  // publish gate rejects, we release.
  const wantsPublish =
    parsed.data.status === "published" ||
    (parsed.data.publishAt && new Date(parsed.data.publishAt) > new Date());
  const reservation = await reservePostQuota({
    userId: auth.user.id,
    count: 1,
    publishedCount: wantsPublish ? 1 : 0,
  });
  if (!reservation.ok) {
    return fail("plan_quota_exceeded", reservation.reason, 402, { limit: reservation.limit, used: reservation.used });
  }

  let result;
  try {
    result = await createPost({
      authorId: auth.user.id,
      apiKeyId: auth.kind === "api_key" ? auth.key.id : null,
      input: parsed.data,
    });
  } catch (err) {
    await releasePostReservation({
      userId: auth.user.id,
      count: 1,
      publishedCount: wantsPublish ? 1 : 0,
    });
    throw err;
  }

  if ("error" in result) {
    await releasePostReservation({
      userId: auth.user.id,
      count: 1,
      publishedCount: wantsPublish ? 1 : 0,
    });
    return fail(result.error.code, result.error.message, 403);
  }

  // Reservation assumed `wantsPublish` published-count; the actual publish
  // may have been downgraded to draft by moderation. Reconcile.
  if (wantsPublish && result.post.status !== "published") {
    await releasePostReservation({ userId: auth.user.id, count: 0, publishedCount: 1 });
  }

  const body = { post: result.post };
  const status = 201;
  if (idemp.key && auth.kind === "api_key") {
    await storeIdempotent(idemp.key, auth.key.id, "POST", "/api/posts", status, body);
  }
  return ok(body, { status });
}
