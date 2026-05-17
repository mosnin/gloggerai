/**
 * Publish-gate consolidation + atomic quota tests. The publish gate used to
 * live in route handlers and was applied inconsistently — single-post-create
 * checked email verification only for API-key callers; batch-create skipped
 * the check entirely. Now it lives in createPost/updatePost so every code
 * path sees the same rule.
 *
 * Quota reservation used to be check-then-bump; concurrent creates at the
 * boundary could all pass the check. Now it's a single SQL INSERT ON CONFLICT
 * with a RETURNING-driven assertion.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createTestUser,
  ensureSchema,
  getPool,
  integrationDbUrl,
  purgeAll,
  shutdownPool,
} from "./setup";

const suite = integrationDbUrl ? describe : describe.skip;

beforeAll(async () => {
  if (!integrationDbUrl) return;
  process.env.DATABASE_URL = integrationDbUrl;
  process.env.SESSION_SECRET ??= "x".repeat(40);
  await ensureSchema();
});

beforeEach(async () => {
  if (integrationDbUrl) await purgeAll();
});

afterAll(async () => {
  await shutdownPool();
});

async function setUserPlan(userId: string, tier: "free" | "pro" | "scale") {
  const p = getPool();
  await p.query(`
    INSERT INTO subscriptions (user_id, tier, status)
    VALUES ($1, $2::plan_tier, 'active'::subscription_status)
    ON CONFLICT (user_id) DO UPDATE SET tier = EXCLUDED.tier, status = EXCLUDED.status
  `, [userId, tier]);
}

async function verifyEmail(userId: string) {
  const p = getPool();
  await p.query(`UPDATE users SET email_verified_at = now() WHERE id = $1`, [userId]);
}

suite("publish gates + atomic quota", () => {
  it("createPost rejects publish for unverified email", async () => {
    const { createPost } = await import("@/lib/posts/service");
    const user = await createTestUser();
    const result = await createPost({
      authorId: user.id,
      input: {
        title: "Trying to publish unverified",
        contentMd: "body",
        tags: [],
        keywords: [],
        status: "published",
      },
    });
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error.code).toBe("email_not_verified");
  });

  it("createPost rejects scheduled publish for unverified email", async () => {
    const { createPost } = await import("@/lib/posts/service");
    const user = await createTestUser();
    const future = new Date(Date.now() + 60_000).toISOString();
    const result = await createPost({
      authorId: user.id,
      input: {
        title: "Scheduled",
        contentMd: "body",
        tags: [],
        keywords: [],
        status: "draft",
        publishAt: future,
      },
    });
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error.code).toBe("email_not_verified");
  });

  it("createPost allows draft for unverified, publish after verification", async () => {
    const { createPost } = await import("@/lib/posts/service");
    const user = await createTestUser();

    const draft = await createPost({
      authorId: user.id,
      input: { title: "Draft", contentMd: "body", tags: [], keywords: [], status: "draft" },
    });
    expect("post" in draft).toBe(true);

    await verifyEmail(user.id);
    const published = await createPost({
      authorId: user.id,
      input: { title: "Published", contentMd: "body", tags: [], keywords: [], status: "published" },
    });
    expect("post" in published).toBe(true);
    if ("post" in published) expect(published.post.status).toBe("published");
  });

  it("updatePost also gates on email verification when first publishing", async () => {
    const { createPost, updatePost } = await import("@/lib/posts/service");
    const user = await createTestUser();
    const draft = await createPost({
      authorId: user.id,
      input: { title: "Draft", contentMd: "body", tags: [], keywords: [], status: "draft" },
    });
    if (!("post" in draft)) throw new Error("setup failed");

    // Unverified publish via PATCH should fail.
    const failed = await updatePost({
      postId: draft.post.id,
      authorId: user.id,
      input: { status: "published" },
    });
    expect(failed && "error" in failed).toBe(true);

    await verifyEmail(user.id);
    const ok = await updatePost({
      postId: draft.post.id,
      authorId: user.id,
      input: { status: "published" },
    });
    expect(ok && "post" in ok).toBe(true);
  });

  it("reservePostQuota rejects beyond the tier cap without leaving a stranded bump", async () => {
    const { reservePostQuota, currentUsage } = await import("@/lib/billing/service");
    const user = await createTestUser();
    await setUserPlan(user.id, "free");

    // Free tier = 25/mo. Burn 25.
    for (let i = 0; i < 25; i++) {
      const r = await reservePostQuota({ userId: user.id });
      expect(r.ok).toBe(true);
    }
    const cap = await reservePostQuota({ userId: user.id });
    expect(cap.ok).toBe(false);
    if (!cap.ok) expect(cap.limit).toBe(25);

    // The rejected reservation must have rolled itself back — used should
    // still be exactly 25, not 26.
    const usage = await currentUsage(user.id);
    expect(usage.postsCreated).toBe(25);
  });

  it("releasePostReservation rolls back on createPost failure", async () => {
    const { reservePostQuota, releasePostReservation, currentUsage } = await import("@/lib/billing/service");
    const user = await createTestUser();
    await setUserPlan(user.id, "free");

    await reservePostQuota({ userId: user.id, count: 1, publishedCount: 1 });
    expect((await currentUsage(user.id)).postsCreated).toBe(1);

    await releasePostReservation({ userId: user.id, count: 1, publishedCount: 1 });
    const after = await currentUsage(user.id);
    expect(after.postsCreated).toBe(0);
    expect(after.postsPublished).toBe(0);
  });

  it("maxRateLimitForUser tracks plan tier", async () => {
    const { maxRateLimitForUser } = await import("@/lib/billing/service");
    const user = await createTestUser();
    // No subscription row → free.
    expect(await maxRateLimitForUser(user.id)).toBe(30);
    await setUserPlan(user.id, "pro");
    expect(await maxRateLimitForUser(user.id)).toBe(120);
    await setUserPlan(user.id, "scale");
    expect(await maxRateLimitForUser(user.id)).toBe(600);
  });
});
