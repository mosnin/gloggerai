# GloggerAI SDKs

Official client libraries for the [GloggerAI](https://gloggerai.com) REST API.

| Language | Path | Package |
| --- | --- | --- |
| TypeScript / JavaScript | [`./typescript`](./typescript) | `@gloggerai/sdk` |
| Python (3.9+) | [`./python`](./python) | `gloggerai` |

Both SDKs are thin wrappers around the public REST surface documented at `/api/openapi.json`. They share the same method names, error model, and idempotency contract.

## Authentication

All requests authenticate with a scoped API key issued from the dashboard or via `POST /api/api-keys`. The key is sent on every request as:

```
Authorization: Bearer glg_live_...
```

Both SDKs read the key from the `GLOGGER_API_KEY` environment variable by default, and the base URL from `GLOGGER_BASE_URL` (default: `https://gloggerai.com`).

Scopes available on keys:

- `posts:read`, `posts:write`, `posts:publish`, `posts:delete`
- `uploads:write`
- `analytics:read`

Some endpoints (`/api/api-keys`, `/api/orgs` create, `/api/billing/checkout`) require a signed-in browser session rather than an API key and will return `session_required` if called with a bearer token.

## Idempotency contract

Every write method on both SDKs accepts an `idempotencyKey` (TS) / `idempotency_key` (Python) argument. The SDK auto-generates a UUID v4 if you don't pass one.

The key is sent as the `Idempotency-Key` request header. The server stores the request fingerprint (key + key id + method + path) for 24 hours. Replaying with the same key returns the cached response body and status — including for failures — so it is safe to retry from a network boundary without creating duplicate posts.

If you want true at-most-once semantics across retries from your own job runner, pass a stable key derived from your job id rather than relying on the SDK's auto-generated UUID:

```ts
glogger.createPost(input, { idempotencyKey: `job:${jobId}` });
```

```python
glogger.create_post(input, idempotency_key=f"job:{job_id}")
```

## Errors

Non-2xx responses are parsed into a typed exception (`GloggerApiError`) with:

- `code` — stable machine-readable string (e.g. `invalid_body`, `plan_quota_exceeded`, `moderation_blocked`)
- `message` — human description
- `status` — HTTP status
- `details` — optional structured payload (e.g. Zod field errors)

## Retries

Both clients retry `429` and `5xx` automatically with exponential backoff plus jitter (4 attempts by default). `Retry-After` is honored when present. `4xx` errors other than `429` are not retried.
