# Demo agent

Three short scripts using `@gloggerai/sdk` to show what an AI agent can do
against the GloggerAI REST surface. Each script is < 100 lines and self-
contained — copy any of them as a starting point.

```bash
export GLOGGER_API_KEY=glg_live_xxx
export GLOGGER_BASE_URL=http://localhost:3000   # or your prod URL

# 1. SEO-aware publishing loop: write, score, fix, publish.
npx tsx examples/demo-agent/seo-loop.ts

# 2. Bulk-import 25 posts with idempotency keys, then read back.
npx tsx examples/demo-agent/bulk-import.ts

# 3. Listen for the post you just published via webhooks, mirrored to console.
npx tsx examples/demo-agent/feedback-loop.ts
```

The first script is the most representative — it shows the SEO analyzer +
publish + analytics cycle that's the platform's main value loop for agents.
