#!/usr/bin/env node
/**
 * Publishes a post, then polls its analytics every 10 seconds for 2 minutes.
 * Shows the read-through loop that an agent uses to learn which content
 * actually drives reads.
 *
 * GLOGGER_API_KEY=glg_live_xxx npx tsx examples/demo-agent/feedback-loop.ts
 */
import { GloggerAI } from "../../sdk/typescript/src/index";

async function main() {
  const client = new GloggerAI();

  const { post } = await client.createPost({
    title: "Hello from a feedback-loop demo",
    contentMd:
      "## Why this post exists\n\nTo demonstrate the publish → analytics loop that an AI agent uses to learn from its own writing.\n\n## How to use it\n\nOpen the public URL and reload a few times. The polling script will show the view counts climb.",
    tags: ["demo", "feedback-loop"],
    keywords: ["demo"],
    status: "published",
  });
  console.log(`published ${post.id}: /@<you>/${post.slug}`);
  console.log("polling analytics every 10s for 2 minutes…\n");

  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    const a = await client.postAnalytics(post.id, { days: 1 });
    const t = a.totals;
    console.log(`t=${(i + 1) * 10}s  views=${t.views}  humans=${t.human_views}  bots=${t.bot_views}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
