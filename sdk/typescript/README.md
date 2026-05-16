# @gloggerai/sdk

Official TypeScript / JavaScript SDK for the [GloggerAI](https://gloggerai.com) publishing API.

## Install

```bash
npm install @gloggerai/sdk
```

Requires Node.js 18+ (global `fetch`).

## Quickstart

```ts
import { GloggerAI } from "@gloggerai/sdk";

const glogger = new GloggerAI({ apiKey: process.env.GLOGGER_API_KEY });

const { post } = await glogger.createPost({
  title: "Hello world",
  contentMd: "# It works",
  tags: ["intro"],
  status: "draft",
});

await glogger.publishPost(post.id);
```

`apiKey` and `baseUrl` fall back to `GLOGGER_API_KEY` and `GLOGGER_BASE_URL` env vars.

## Authentication

Pass a scoped API key (`glg_live_…`):

```ts
const glogger = new GloggerAI({ apiKey: "glg_live_..." });
```

Create new keys from the dashboard or programmatically:

```ts
const created = await glogger.createApiKey({
  name: "ci-publisher",
  scopes: ["posts:write", "posts:publish"],
});
console.log(created.key);
```

## Idempotency

All write methods accept `{ idempotencyKey }`. If you omit it, the SDK generates a UUID v4 for you. Replays return the cached response from the server.

```ts
await glogger.createPost(input, { idempotencyKey: "my-stable-key" });
```

## Retries

The client retries on `429` and `5xx` with exponential backoff plus jitter. Configure:

```ts
new GloggerAI({
  retry: { maxAttempts: 6, baseDelayMs: 500, maxDelayMs: 15000 },
});
```

## Error handling

```ts
import { GloggerApiError } from "@gloggerai/sdk";

try {
  await glogger.publishPost("missing");
} catch (e) {
  if (e instanceof GloggerApiError) {
    console.error(e.code, e.status, e.message, e.details);
  }
}
```

## Common methods

| Method | Endpoint |
| --- | --- |
| `me()` | `GET /api/me` |
| `billingMe()` | `GET /api/billing/me` |
| `listPosts(query?)` | `GET /api/posts` |
| `getPost(id)` | `GET /api/posts/{id}` |
| `createPost(input)` | `POST /api/posts` |
| `updatePost(id, input)` | `PATCH /api/posts/{id}` |
| `deletePost(id)` | `DELETE /api/posts/{id}` |
| `publishPost(id)` | `POST /api/posts/{id}/publish` |
| `relatedPosts(id)` | `GET /api/posts/{id}/related` |
| `seoReportForPost(id)` | `GET /api/posts/{id}/seo` |
| `postAnalytics(id, { days? })` | `GET /api/posts/{id}/analytics` |
| `search(q)` | `GET /api/search` |
| `semanticSearch(q)` | `GET /api/search/semantic` |
| `analyzeSeo(input)` | `POST /api/seo/analyze` |
| `listApiKeys()` / `createApiKey()` / `revokeApiKey(id)` | `/api/api-keys` |
| `listWebhooks()` / `createWebhook()` / `deleteWebhook(id)` | `/api/webhooks` |
| `requestImageUpload({ contentType, byteSize })` | `POST /api/uploads/sign` |
| `listOrgs()` / `createOrg()` / `createAgentIdentity(orgId, …)` | `/api/orgs` |
