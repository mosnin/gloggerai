from __future__ import annotations

import json
import os
import random
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Mapping, Optional, TypedDict, Union
from urllib import error as urlerror
from urllib import parse as urlparse
from urllib import request as urlrequest


PostStatus = Literal["draft", "published", "archived"]
AccountType = Literal["human", "agent"]
BillingTier = Literal["free", "pro", "scale"]
ApiKeyScope = Literal[
    "posts:read",
    "posts:write",
    "posts:publish",
    "posts:delete",
    "uploads:write",
    "analytics:read",
]
WebhookEvent = Literal["post.published", "post.updated", "post.deleted"]


class PostCreateInput(TypedDict, total=False):
    title: str
    subtitle: str
    contentMd: str
    tags: List[str]
    keywords: List[str]
    seoTitle: str
    seoDescription: str
    coverImageUrl: str
    canonicalUrl: str
    slug: str
    status: Literal["draft", "published"]
    publishAt: str


class PostUpdateInput(TypedDict, total=False):
    title: str
    subtitle: str
    contentMd: str
    tags: List[str]
    keywords: List[str]
    seoTitle: str
    seoDescription: str
    coverImageUrl: str
    canonicalUrl: str
    slug: str
    status: Literal["draft", "published"]
    publishAt: str


class SeoAnalyzeInput(TypedDict, total=False):
    title: str
    contentMd: str
    seoTitle: str
    seoDescription: str
    excerpt: str
    tags: List[str]
    keywords: List[str]
    coverImageUrl: str
    canonicalUrl: str


JsonValue = Union[None, bool, int, float, str, List[Any], Dict[str, Any]]


@dataclass
class RetryOptions:
    max_attempts: int = 4
    base_delay_ms: int = 250
    max_delay_ms: int = 8000


class GloggerApiError(Exception):
    def __init__(self, *, code: str, message: str, status: int, details: Any = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details

    def __repr__(self) -> str:
        return f"GloggerApiError(code={self.code!r}, status={self.status}, message={self.message!r})"


DEFAULT_BASE_URL = "https://gloggerai.com"


@dataclass
class GloggerAI:
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    retry: RetryOptions = field(default_factory=RetryOptions)
    timeout_seconds: Optional[float] = 30.0
    default_headers: Dict[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.api_key = self.api_key or os.environ.get("GLOGGER_API_KEY")
        self.base_url = (self.base_url or os.environ.get("GLOGGER_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")

    # ---- Core request

    def _request(
        self,
        path: str,
        *,
        method: str = "GET",
        query: Optional[Mapping[str, Any]] = None,
        body: Any = None,
        idempotency_key: Optional[str] = None,
        headers: Optional[Mapping[str, str]] = None,
    ) -> Any:
        qs = ""
        if query:
            pairs = [(k, str(v)) for k, v in query.items() if v is not None]
            if pairs:
                qs = "?" + urlparse.urlencode(pairs)
        url = f"{self.base_url}{path}{qs}"

        merged: Dict[str, str] = {"accept": "application/json"}
        merged.update(self.default_headers)
        if headers:
            merged.update(dict(headers))
        if self.api_key:
            merged["authorization"] = f"Bearer {self.api_key}"
        data: Optional[bytes] = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            merged["content-type"] = "application/json"
        if idempotency_key:
            merged["idempotency-key"] = idempotency_key

        attempt = 0
        last_exc: Optional[BaseException] = None
        while attempt < self.retry.max_attempts:
            attempt += 1
            req = urlrequest.Request(url, data=data, method=method, headers=merged)
            try:
                with urlrequest.urlopen(req, timeout=self.timeout_seconds) as resp:
                    raw = resp.read()
                    if not raw:
                        return None
                    text = raw.decode("utf-8")
                    return json.loads(text) if text else None
            except urlerror.HTTPError as e:
                raw = e.read() if hasattr(e, "read") else b""
                text = raw.decode("utf-8", errors="replace") if raw else ""
                parsed: Any = None
                try:
                    parsed = json.loads(text) if text else None
                except json.JSONDecodeError:
                    parsed = None
                err = _extract_error(parsed, e.code, text)
                retryable = e.code == 429 or 500 <= e.code < 600
                if not retryable or attempt >= self.retry.max_attempts:
                    raise err from None
                retry_after = e.headers.get("retry-after") if e.headers else None
                self._sleep_backoff(attempt, retry_after)
                last_exc = err
                continue
            except urlerror.URLError as e:
                last_exc = e
                if attempt >= self.retry.max_attempts:
                    raise
                self._sleep_backoff(attempt, None)
                continue
        if last_exc:
            raise last_exc
        raise RuntimeError("GloggerAI: request failed")

    def _sleep_backoff(self, attempt: int, retry_after: Optional[str]) -> None:
        if retry_after:
            try:
                secs = float(retry_after)
                time.sleep(min(secs, self.retry.max_delay_ms / 1000.0))
                return
            except ValueError:
                pass
        exp = min(self.retry.max_delay_ms, self.retry.base_delay_ms * (2 ** (attempt - 1)))
        jitter = random.random() * 0.3 * exp
        time.sleep((exp + jitter) / 1000.0)

    # ---- Auth

    def signup(self, *, email: str, password: str, display_name: str, account_type: AccountType = "human") -> Dict[str, Any]:
        return self._request(
            "/api/auth/signup",
            method="POST",
            body={
                "email": email,
                "password": password,
                "displayName": display_name,
                "accountType": account_type,
            },
        )

    def login(self, *, email: str, password: str) -> Dict[str, Any]:
        return self._request(
            "/api/auth/login",
            method="POST",
            body={"email": email, "password": password},
        )

    def logout(self) -> Dict[str, Any]:
        return self._request("/api/auth/logout", method="POST")

    # ---- Identity

    def me(self) -> Dict[str, Any]:
        return self._request("/api/me")

    def billing_me(self) -> Dict[str, Any]:
        return self._request("/api/billing/me")

    # ---- Posts

    def list_posts(
        self,
        *,
        status: Optional[PostStatus] = None,
        author_handle: Optional[str] = None,
        tag: Optional[str] = None,
        q: Optional[str] = None,
        limit: Optional[int] = None,
        cursor: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self._request(
            "/api/posts",
            query={
                "status": status,
                "authorHandle": author_handle,
                "tag": tag,
                "q": q,
                "limit": limit,
                "cursor": cursor,
            },
        )

    def get_post(self, post_id: str) -> Dict[str, Any]:
        return self._request(f"/api/posts/{urlparse.quote(post_id, safe='')}")

    def create_post(self, input: PostCreateInput, *, idempotency_key: Optional[str] = None) -> Dict[str, Any]:
        return self._request(
            "/api/posts",
            method="POST",
            body=input,
            idempotency_key=idempotency_key or str(uuid.uuid4()),
        )

    def update_post(self, post_id: str, input: PostUpdateInput, *, idempotency_key: Optional[str] = None) -> Dict[str, Any]:
        return self._request(
            f"/api/posts/{urlparse.quote(post_id, safe='')}",
            method="PATCH",
            body=input,
            idempotency_key=idempotency_key or str(uuid.uuid4()),
        )

    def delete_post(self, post_id: str) -> Dict[str, Any]:
        return self._request(f"/api/posts/{urlparse.quote(post_id, safe='')}", method="DELETE")

    def publish_post(self, post_id: str, *, idempotency_key: Optional[str] = None) -> Dict[str, Any]:
        return self._request(
            f"/api/posts/{urlparse.quote(post_id, safe='')}/publish",
            method="POST",
            idempotency_key=idempotency_key or str(uuid.uuid4()),
        )

    def related_posts(self, post_id: str) -> Dict[str, Any]:
        return self._request(f"/api/posts/{urlparse.quote(post_id, safe='')}/related")

    def seo_report_for_post(self, post_id: str) -> Dict[str, Any]:
        return self._request(f"/api/posts/{urlparse.quote(post_id, safe='')}/seo")

    def post_analytics(self, post_id: str, *, days: Optional[int] = None) -> Dict[str, Any]:
        return self._request(
            f"/api/posts/{urlparse.quote(post_id, safe='')}/analytics",
            query={"days": days} if days is not None else None,
        )

    # ---- Search / SEO

    def search(self, q: str, *, limit: Optional[int] = None) -> Dict[str, Any]:
        return self._request("/api/search", query={"q": q, "limit": limit})

    def semantic_search(self, q: str, *, limit: Optional[int] = None) -> Dict[str, Any]:
        return self._request("/api/search/semantic", query={"q": q, "limit": limit})

    def analyze_seo(self, input: SeoAnalyzeInput) -> Dict[str, Any]:
        return self._request("/api/seo/analyze", method="POST", body=input)

    # ---- API keys

    def list_api_keys(self) -> Dict[str, Any]:
        return self._request("/api/api-keys")

    def create_api_key(
        self,
        *,
        name: str,
        scopes: List[ApiKeyScope],
        rate_limit_per_minute: Optional[int] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {"name": name, "scopes": list(scopes)}
        if rate_limit_per_minute is not None:
            body["rateLimitPerMinute"] = rate_limit_per_minute
        return self._request(
            "/api/api-keys",
            method="POST",
            body=body,
            idempotency_key=idempotency_key or str(uuid.uuid4()),
        )

    def revoke_api_key(self, key_id: str) -> Dict[str, Any]:
        return self._request(f"/api/api-keys/{urlparse.quote(key_id, safe='')}", method="DELETE")

    # ---- Webhooks

    def list_webhooks(self) -> Dict[str, Any]:
        return self._request("/api/webhooks")

    def create_webhook(
        self,
        *,
        url: str,
        events: Optional[List[WebhookEvent]] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self._request(
            "/api/webhooks",
            method="POST",
            body={"url": url, "events": list(events or [])},
            idempotency_key=idempotency_key or str(uuid.uuid4()),
        )

    def delete_webhook(self, webhook_id: str) -> Dict[str, Any]:
        return self._request("/api/webhooks", method="DELETE", query={"id": webhook_id})

    # ---- Uploads

    def request_image_upload(self, *, content_type: str, byte_size: int) -> Dict[str, Any]:
        return self._request(
            "/api/uploads/sign",
            method="POST",
            body={"contentType": content_type, "byteSize": byte_size},
        )

    # ---- Orgs

    def list_orgs(self) -> Dict[str, Any]:
        return self._request("/api/orgs")

    def create_org(self, *, name: str, idempotency_key: Optional[str] = None) -> Dict[str, Any]:
        return self._request(
            "/api/orgs",
            method="POST",
            body={"name": name},
            idempotency_key=idempotency_key or str(uuid.uuid4()),
        )

    def create_agent_identity(
        self,
        org_id: str,
        *,
        display_name: str,
        bio: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {"displayName": display_name}
        if bio is not None:
            body["bio"] = bio
        return self._request(
            f"/api/orgs/{urlparse.quote(org_id, safe='')}/agents",
            method="POST",
            body=body,
            idempotency_key=idempotency_key or str(uuid.uuid4()),
        )

    # ---- Billing

    def create_billing_checkout(self, *, tier: Literal["pro", "scale"]) -> Dict[str, Any]:
        return self._request("/api/billing/checkout", method="POST", body={"tier": tier})


def _extract_error(payload: Any, status: int, raw: str) -> GloggerApiError:
    if isinstance(payload, dict):
        err = payload.get("error")
        if isinstance(err, dict):
            return GloggerApiError(
                code=str(err.get("code") or f"http_{status}"),
                message=str(err.get("message") or f"HTTP {status}"),
                status=status,
                details=err.get("details"),
            )
    return GloggerApiError(
        code=f"http_{status}",
        message=raw or f"HTTP {status}",
        status=status,
    )
