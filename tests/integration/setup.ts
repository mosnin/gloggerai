/**
 * Integration-test bootstrap. Connects to INTEGRATION_DATABASE_URL, applies
 * the full migration set if the schema is empty, and exposes helpers to
 * insert isolated fixtures inside a transaction-per-test.
 *
 * Skipped silently in unit-test runs (INTEGRATION_DATABASE_URL unset).
 */
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

export const integrationDbUrl = process.env.INTEGRATION_DATABASE_URL;

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!integrationDbUrl) throw new Error("INTEGRATION_DATABASE_URL not set");
  if (!pool) pool = new Pool({ connectionString: integrationDbUrl, max: 4 });
  return pool;
}

export async function shutdownPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Run once before any test in the file: ensure schema is present. */
export async function ensureSchema(): Promise<void> {
  const p = getPool();
  const tables = await p.query<{ count: number }>(
    `SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema = 'public'`,
  );
  if ((tables.rows[0]?.count ?? 0) > 5) return;
  // Schema is empty — re-run the migrations. Caller should normally apply
  // these in CI before tests run; this fallback keeps local dev easy.
  execSync("npx drizzle-kit generate --name=test", {
    env: { ...process.env, DATABASE_URL: integrationDbUrl },
    stdio: "inherit",
  });
  execSync("npm run db:migrate", {
    env: { ...process.env, DATABASE_URL: integrationDbUrl },
    stdio: "inherit",
  });
}

let prng = 0;
export function uniqSuffix(): string {
  prng += 1;
  return `${Date.now().toString(36)}${prng}${randomUUID().slice(0, 8)}`;
}

export type TestUser = { id: string; handle: string; email: string };

export async function createTestUser(opts: { handle?: string; agent?: boolean } = {}): Promise<TestUser> {
  const p = getPool();
  const suffix = uniqSuffix();
  const handle = (opts.handle ?? "test") + "-" + suffix;
  const email = `${handle}@test.local`;
  const r = await p.query<{ id: string }>(
    `INSERT INTO users (email, handle, display_name, password_hash, account_type)
     VALUES ($1, $2, $2, 'x', $3::account_type)
     RETURNING id::text AS id`,
    [email, handle, opts.agent ? "agent" : "human"],
  );
  return { id: r.rows[0].id, handle, email };
}

export async function createTestPost(authorId: string, overrides: { tags?: string[]; status?: "draft" | "published" } = {}): Promise<{
  id: string;
  slug: string;
}> {
  const p = getPool();
  const suffix = uniqSuffix();
  const slug = `post-${suffix}`;
  const r = await p.query<{ id: string; slug: string }>(
    `INSERT INTO posts (author_id, slug, title, content_md, excerpt, tags, status, moderation_status, reading_time_minutes, word_count, published_at)
     VALUES ($1, $2, 'Test post', 'body', 'body', $3::jsonb, $4::post_status, 'approved', 1, 100, now())
     RETURNING id::text AS id, slug`,
    [authorId, slug, JSON.stringify(overrides.tags ?? []), overrides.status ?? "published"],
  );
  return r.rows[0];
}

const PURGE_TABLES = [
  "notifications",
  "claps",
  "bookmarks",
  "follows",
  "topic_follows",
  "comments",
  "post_revisions",
  "post_views",
  "post_embeddings",
  "posts",
  "api_key_usage",
  "api_keys",
  "sessions",
  "users",
];

export async function purgeAll(): Promise<void> {
  // Truncate user-data tables in dependency order. Skips any that don't
  // exist in this environment (e.g. post_embeddings when pgvector isn't
  // installed on the local Postgres).
  const p = getPool();
  const present = await p.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
  );
  const have = new Set(present.rows.map((r) => r.table_name));
  const list = PURGE_TABLES.filter((t) => have.has(t));
  if (list.length === 0) return;
  await p.query(`TRUNCATE TABLE ${list.join(", ")} RESTART IDENTITY CASCADE`);
}
