/**
 * Idempotency cross-user collision regression.
 *
 * The original schema had `idempotency_keys.key` as a bare PK, so two API
 * keys submitting the same Idempotency-Key string would collide and the
 * second caller would see the first caller's cached response. The composite
 * PK (api_key_id, key) is what keeps them isolated.
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
import { randomUUID } from "node:crypto";

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

async function makeApiKey(userId: string): Promise<string> {
  const p = getPool();
  const id = randomUUID();
  const prefix = `glg_live_${id.slice(0, 8)}`;
  await p.query(
    `INSERT INTO api_keys (id, user_id, name, prefix, hash, scopes, rate_limit_per_minute)
     VALUES ($1, $2, 'test', $3, $4, '["posts:write"]'::jsonb, 60)`,
    [id, userId, prefix, "test-hash-" + id],
  );
  return id;
}

suite("idempotency cross-user isolation", () => {
  it("two api keys with the same Idempotency-Key get independent caches", async () => {
    const { checkIdempotency, storeIdempotent } = await import("@/lib/api/idempotency");
    const userA = await createTestUser();
    const userB = await createTestUser();
    const keyA = await makeApiKey(userA.id);
    const keyB = await makeApiKey(userB.id);

    const sharedKey = "same-string-from-both-callers";
    await storeIdempotent(sharedKey, keyA, "POST", "/api/posts", 201, { post: { authorOf: userA.id } });

    // First caller — replay hit.
    const replayA = await checkIdempotency(sharedKey, keyA);
    expect(replayA.cached).not.toBeNull();
    const bodyA = (await replayA.cached!.json()) as { post: { authorOf: string } };
    expect(bodyA.post.authorOf).toBe(userA.id);

    // Second caller, same key string — must be a cache MISS, not user A's body.
    const replayB = await checkIdempotency(sharedKey, keyB);
    expect(replayB.cached).toBeNull();
    expect(replayB.key).toBe(sharedKey);
  });

  it("both api keys can independently store cache entries for the same key string", async () => {
    const { checkIdempotency, storeIdempotent } = await import("@/lib/api/idempotency");
    const userA = await createTestUser();
    const userB = await createTestUser();
    const keyA = await makeApiKey(userA.id);
    const keyB = await makeApiKey(userB.id);

    const sharedKey = "another-collision-attempt";
    await storeIdempotent(sharedKey, keyA, "POST", "/api/posts", 201, { result: "A" });
    await storeIdempotent(sharedKey, keyB, "POST", "/api/posts", 201, { result: "B" });

    const replayA = (await (await checkIdempotency(sharedKey, keyA)).cached!.json()) as { result: string };
    const replayB = (await (await checkIdempotency(sharedKey, keyB)).cached!.json()) as { result: string };
    expect(replayA.result).toBe("A");
    expect(replayB.result).toBe("B");
  });

  it("cleanup deletes idempotency rows older than 24h", async () => {
    const { runCleanup } = await import("@/lib/jobs/cleanup");
    const user = await createTestUser();
    const key = await makeApiKey(user.id);
    const p = getPool();

    await p.query(
      `INSERT INTO idempotency_keys (key, api_key_id, method, path, response_status, response_body, created_at)
       VALUES ('old', $1, 'POST', '/api/posts', 201, '{}'::jsonb, now() - interval '25 hours'),
              ('new', $1, 'POST', '/api/posts', 201, '{}'::jsonb, now())`,
      [key],
    );
    const report = await runCleanup();
    expect(report.idempotencyKeys).toBeGreaterThanOrEqual(1);
    const remaining = await p.query<{ key: string }>(
      `SELECT key FROM idempotency_keys WHERE api_key_id = $1`,
      [key],
    );
    expect(remaining.rows.map((r) => r.key)).toEqual(["new"]);
  });

  it("cleanup deletes expired sessions and used/expired oauth codes", async () => {
    const { runCleanup } = await import("@/lib/jobs/cleanup");
    const user = await createTestUser();
    const p = getPool();

    await p.query(
      `INSERT INTO sessions (id, user_id, expires_at) VALUES
        ('expired', $1, now() - interval '1 day'),
        ('live', $1, now() + interval '1 day')`,
      [user.id],
    );

    await p.query(`
      INSERT INTO oauth_clients (id, owner_user_id, client_id, client_secret_hash, name, redirect_uris, allowed_scopes)
      VALUES (gen_random_uuid(), $1, 'glgcli_test', 'h', 'test', '["https://x.example.com/cb"]'::jsonb, '[]'::jsonb)
    `, [user.id]);

    await p.query(`
      INSERT INTO oauth_authorization_codes
        (code_hash, client_id, user_id, scopes, redirect_uri, code_challenge, code_challenge_method, expires_at, used_at)
      VALUES
        ('hash-used', 'glgcli_test', $1, '[]'::jsonb, 'r', 'c', 'S256', now() + interval '10 min', now()),
        ('hash-old',  'glgcli_test', $1, '[]'::jsonb, 'r', 'c', 'S256', now() - interval '2 hours', null),
        ('hash-live', 'glgcli_test', $1, '[]'::jsonb, 'r', 'c', 'S256', now() + interval '10 min', null)
    `, [user.id]);

    const report = await runCleanup();
    expect(report.sessions).toBeGreaterThanOrEqual(1);
    expect(report.oauthCodes).toBeGreaterThanOrEqual(2);

    const sess = await p.query<{ id: string }>(`SELECT id FROM sessions WHERE user_id = $1`, [user.id]);
    expect(sess.rows.map((r) => r.id)).toEqual(["live"]);
  });
});
