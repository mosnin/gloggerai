#!/usr/bin/env node
/**
 * Bulk-import 25 changelog entries with stable idempotency keys so the script
 * is safely re-runnable. Reads them back via the list endpoint.
 *
 * GLOGGER_API_KEY=glg_live_xxx npx tsx examples/demo-agent/bulk-import.ts
 */
import { GloggerAI } from "../../sdk/typescript/src/index";

const FEATURES = [
  ["MCP HTTP+SSE transport", "Remote agents can now connect to /api/mcp/sse over Bearer auth."],
  ["OAuth 2.1 + PKCE", "Third-party agent platforms can request scoped keys on a user's behalf."],
  ["Bulk post creation", "POST /api/posts/batch accepts up to 50 items with per-item idempotency."],
  ["Idempotency on all writes", "Idempotency-Key now honored on PATCH/DELETE/publish/uploads/webhooks."],
  ["/api/usage endpoint", "Real-time per-key quota + monthly post counts."],
  ["Webhook delivery replay", "Inspect deliveries and replay failures."],
  ["Content versioning", "post_revisions with restore."],
  ["Draft preview URLs", "Signed short-lived tokens to share unpublished drafts."],
  ["Structured moderation", "Multi-category analyzer exposed at /api/moderation/analyze."],
  ["Comments", "Threaded responses on every published post."],
  ["Claps", "Medium-style 1–50 per user reaction."],
  ["Bookmarks", "Save-for-later list on every account."],
  ["Follows", "Follow users + topic tags; powers the personalized feed."],
  ["Notifications", "In-app inbox for comments, follower publishes, clap milestones."],
  ["Personalized feed", "/api/feed merges followed users, followed topics, fresh discovery."],
  ["Resend email backend", "Verification + password reset emails ship via Resend (env-gated)."],
  ["Sentry capture", "Zero-dep envelope to Sentry on every log.error."],
  ["Migration runner in CI", "Real Postgres + pgvector spun up in CI to verify schema applies cleanly."],
  ["Sample agent suite", "examples/demo-agent shows the SEO loop, bulk import, and feedback loop."],
  ["TypeScript + Python SDKs", "Zero-dep clients with auto idempotency and retry."],
  ["Account deletion", "DELETE /api/me cascades user-owned data."],
  ["CSRF protection", "Double-submit cookie on every session-authed mutation."],
  ["SIGTERM-clean worker", "Graceful shutdown waits for the in-flight tick before exit."],
  ["Drop view_count", "Stale column removed; analytics live in post_views."],
  ["Cycle-free schema", "Enums hoisted out of schema.ts so per-feature schema files can import safely."],
];

async function main() {
  const client = new GloggerAI();

  const items = FEATURES.map(([title, body], i) => ({
    title: `Changelog: ${title}`,
    subtitle: body,
    contentMd: `## ${title}\n\n${body}\n\n— item #${i + 1} in this release wave.`,
    tags: ["changelog"],
    keywords: ["changelog", title.toLowerCase().split(" ")[0]],
    status: "draft" as const,
  }));

  // One stable batch key per run-day so re-running on the same day no-ops.
  const day = new Date().toISOString().slice(0, 10);
  const batchKey = `changelog-${day}`;

  const result = await client.batchCreatePosts(items, { idempotencyKey: batchKey });
  const created = result.results.filter((r) => r.ok).length;
  const failed = result.results.length - created;
  console.log(`batch: ${created} created, ${failed} failed`);

  const list = await client.listPosts({ status: "draft", limit: 50 });
  console.log(`now have ${list.items.length} drafts (showing 5):`);
  for (const p of list.items.slice(0, 5)) {
    console.log(`  - ${p.title}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
