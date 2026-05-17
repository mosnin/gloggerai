import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate, requireScope } from "@/lib/api/auth-guard";
import { checkIdempotency, storeIdempotent } from "@/lib/api/idempotency";
import { checkDailyPostLimit } from "@/lib/api/abuse";
import { releasePostReservation, requireFeature, reservePostQuota } from "@/lib/billing/service";
import { fail, ok } from "@/lib/api/response";
import { PostCreate } from "@/lib/posts/schema";
import { createPost } from "@/lib/posts/service";
import type { Post } from "@/db/schema";

const Body = z.object({
  items: z.array(z.unknown()).min(1).max(50),
});

type ItemResult = {
  index: number;
  ok: boolean;
  post?: Post;
  error?: { code: string; message: string; details?: unknown };
};

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const scopeFail = requireScope(auth, "posts:write");
  if (scopeFail) return scopeFail;

  const apiKeyId = auth.kind === "api_key" ? auth.key.id : null;
  const batchIdemp = await checkIdempotency(req, apiKeyId);
  if (batchIdemp.cached) return batchIdemp.cached;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("invalid_body", "Invalid request body", 422, parsed.error.flatten());

  const results: ItemResult[] = [];

  for (let i = 0; i < parsed.data.items.length; i++) {
    const raw = parsed.data.items[i];
    const itemParse = PostCreate.safeParse(raw);
    if (!itemParse.success) {
      results.push({ index: i, ok: false, error: { code: "invalid_body", message: "schema validation failed", details: itemParse.error.flatten() } });
      continue;
    }

    if (itemParse.data.status === "published" && auth.kind === "api_key") {
      const publishFail = requireScope(auth, "posts:publish");
      if (publishFail) {
        results.push({ index: i, ok: false, error: { code: "missing_scope", message: "posts:publish required" } });
        continue;
      }
    }

    const limit = await checkDailyPostLimit(auth.user.id);
    if (!limit.ok) {
      results.push({ index: i, ok: false, error: { code: "daily_limit_exceeded", message: `cap ${limit.cap} reached` } });
      continue;
    }

    if (itemParse.data.publishAt) {
      const feat = await requireFeature(auth.user.id, "scheduledPublishing");
      if (!feat.ok) {
        results.push({ index: i, ok: false, error: { code: "plan_feature_required", message: feat.reason } });
        continue;
      }
    }

    if (batchIdemp.key && apiKeyId) {
      const perItemKey = `${batchIdemp.key}:${i}`;
      const cached = await checkIdempotency(perItemKey, apiKeyId);
      if (cached.cached) {
        try {
          const json = (await cached.cached.json()) as { post?: Post; error?: ItemResult["error"] };
          results.push({ index: i, ok: !!json.post, post: json.post, error: json.error });
          continue;
        } catch {}
      }
    }

    // Reserve quota per-item so concurrent batches from the same user don't
    // overshoot the monthly cap.
    const wantsPublish =
      itemParse.data.status === "published" ||
      (itemParse.data.publishAt && new Date(itemParse.data.publishAt) > new Date());
    const reservation = await reservePostQuota({
      userId: auth.user.id,
      count: 1,
      publishedCount: wantsPublish ? 1 : 0,
    });
    if (!reservation.ok) {
      results.push({ index: i, ok: false, error: { code: "plan_quota_exceeded", message: reservation.reason } });
      continue;
    }

    let result: Awaited<ReturnType<typeof createPost>>;
    try {
      result = await createPost({
        authorId: auth.user.id,
        apiKeyId,
        input: itemParse.data,
      });
    } catch (err) {
      await releasePostReservation({
        userId: auth.user.id,
        count: 1,
        publishedCount: wantsPublish ? 1 : 0,
      });
      results.push({
        index: i,
        ok: false,
        error: { code: "internal_error", message: err instanceof Error ? err.message : String(err) },
      });
      continue;
    }

    if ("error" in result) {
      await releasePostReservation({
        userId: auth.user.id,
        count: 1,
        publishedCount: wantsPublish ? 1 : 0,
      });
      results.push({ index: i, ok: false, error: { code: result.error.code, message: result.error.message } });
      continue;
    }

    if (wantsPublish && result.post.status !== "published") {
      await releasePostReservation({ userId: auth.user.id, count: 0, publishedCount: 1 });
    }

    const itemBody = { post: result.post };
    if (batchIdemp.key && apiKeyId) {
      await storeIdempotent(`${batchIdemp.key}:${i}`, apiKeyId, "POST", "/api/posts/batch", 201, itemBody);
    }
    results.push({ index: i, ok: true, post: result.post });
  }

  const body = { results };
  if (batchIdemp.key && apiKeyId) {
    await storeIdempotent(batchIdemp.key, apiKeyId, "POST", "/api/posts/batch", 200, body);
  }
  return ok(body);
}
