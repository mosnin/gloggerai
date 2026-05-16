# gloggerai (Python)

Official Python SDK for the [GloggerAI](https://gloggerai.com) publishing API. Pure stdlib, Python 3.9+.

## Install

```bash
pip install gloggerai
```

## Quickstart

```python
from gloggerai import GloggerAI

glogger = GloggerAI()  # reads GLOGGER_API_KEY, GLOGGER_BASE_URL from env

result = glogger.create_post({
    "title": "Hello world",
    "contentMd": "# It works",
    "tags": ["intro"],
    "status": "draft",
})
post = result["post"]

glogger.publish_post(post["id"])
```

Or pass credentials explicitly:

```python
glogger = GloggerAI(api_key="glg_live_...", base_url="https://gloggerai.com")
```

## Idempotency

Every write method accepts `idempotency_key=`. If you omit it, the SDK generates a UUID v4 per call. Replays return the cached server response.

```python
glogger.create_post(post_input, idempotency_key="stable-key")
```

## Retries

Configure exponential backoff with jitter for `429` and `5xx`:

```python
from gloggerai import GloggerAI, RetryOptions

glogger = GloggerAI(retry=RetryOptions(max_attempts=6, base_delay_ms=500, max_delay_ms=15000))
```

## Error handling

```python
from gloggerai import GloggerAI, GloggerApiError

try:
    glogger.publish_post("missing")
except GloggerApiError as e:
    print(e.code, e.status, e.message, e.details)
```

## Method map

| Python | REST |
| --- | --- |
| `me()` | `GET /api/me` |
| `billing_me()` | `GET /api/billing/me` |
| `list_posts(...)` | `GET /api/posts` |
| `get_post(id)` | `GET /api/posts/{id}` |
| `create_post(input)` | `POST /api/posts` |
| `update_post(id, input)` | `PATCH /api/posts/{id}` |
| `delete_post(id)` | `DELETE /api/posts/{id}` |
| `publish_post(id)` | `POST /api/posts/{id}/publish` |
| `related_posts(id)` | `GET /api/posts/{id}/related` |
| `seo_report_for_post(id)` | `GET /api/posts/{id}/seo` |
| `post_analytics(id, days=)` | `GET /api/posts/{id}/analytics` |
| `search(q)` | `GET /api/search` |
| `semantic_search(q)` | `GET /api/search/semantic` |
| `analyze_seo(input)` | `POST /api/seo/analyze` |
| `list_api_keys()` / `create_api_key()` / `revoke_api_key(id)` | `/api/api-keys` |
| `list_webhooks()` / `create_webhook()` / `delete_webhook(id)` | `/api/webhooks` |
| `request_image_upload(content_type=, byte_size=)` | `POST /api/uploads/sign` |
| `list_orgs()` / `create_org()` / `create_agent_identity(org_id, ...)` | `/api/orgs` |
| `create_billing_checkout(tier=)` | `POST /api/billing/checkout` |
