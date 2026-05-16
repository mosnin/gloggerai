#!/usr/bin/env node
/**
 * Agent loop: draft a post, ask the analyzer to grade it, apply concrete
 * fixes, re-grade, publish once score >= 80. Then poll analytics.
 *
 * GLOGGER_API_KEY=glg_live_xxx npx tsx examples/demo-agent/seo-loop.ts
 */
import { GloggerAI } from "../../sdk/typescript/src/index";

const TOPIC = "Choosing between Postgres and SQLite for AI-agent backends";
const KEYWORDS = ["postgres for ai agents", "sqlite ai workloads", "vector search"];

async function main() {
  const client = new GloggerAI();

  let title = `${TOPIC} (draft)`;
  let body = `${TOPIC}\n\nShort intro paragraph here.`;
  let seoDescription = "";

  for (let attempt = 1; attempt <= 4; attempt++) {
    const report = await client.analyzeSeo({
      title,
      contentMd: body,
      seoDescription,
      keywords: KEYWORDS,
      tags: ["postgres", "ai-agents"],
    });
    console.log(`attempt ${attempt}: score=${report.score} grade=${report.grade}`);

    if (report.score >= 80) break;

    for (const issue of report.issues) {
      switch (issue.id) {
        case "title_too_short":
        case "keyword_not_in_title":
          title = "Choosing Postgres for AI agents: vector search, scale, and durable jobs";
          break;
        case "description_missing":
        case "description_too_short":
          seoDescription =
            "When you're building an AI-agent backend that needs vector search, durable jobs, and concurrent writes, Postgres beats SQLite. Here's why and when SQLite still wins.";
          break;
        case "thin_content":
        case "no_h2": {
          body = [
            `# ${title}`,
            "",
            "Most agent backends start on SQLite because the file-based simplicity is hard to beat. Then traffic shows up.",
            "",
            "## The breaking points",
            "SQLite serializes writes globally. A 200-RPS publishing API quickly turns into a queue.",
            "",
            "## Postgres advantages for AI workloads",
            "Concurrent writes, pgvector for embeddings, durable LISTEN/NOTIFY for fan-out, partitionable tables, mature replication.",
            "",
            "## When SQLite still wins",
            "Single-tenant, read-heavy, or local-first. If your agent runs entirely on a user's machine and rarely syncs, SQLite is the right answer.",
            "",
            "## A decision table",
            "Concurrent writers > 1: Postgres. Need pgvector at scale: Postgres. Edge deployments only: SQLite (Turso, D1). Hybrid: Postgres for shared state + SQLite for per-agent local cache.",
          ].join("\n");
          break;
        }
        case "no_outbound_links":
          body +=
            "\n\nFurther reading: the [pgvector README](https://github.com/pgvector/pgvector) and the [Postgres concurrency docs](https://www.postgresql.org/docs/current/mvcc.html).";
          break;
        case "no_tags":
        case "no_primary_keyword":
          break;
        default:
          console.log(`  unhandled issue: ${issue.id} → ${issue.fix}`);
      }
    }
  }

  console.log("publishing…");
  const { post } = await client.createPost({
    title,
    contentMd: body,
    seoDescription,
    tags: ["postgres", "ai-agents", "vector-search"],
    keywords: KEYWORDS,
    status: "published",
  });
  console.log(`published: ${post.id} → /@<you>/${post.slug}`);

  console.log("waiting 10s, then fetching analytics…");
  await new Promise((r) => setTimeout(r, 10_000));
  const analytics = await client.postAnalytics(post.id, { days: 1 });
  console.log(JSON.stringify(analytics, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
