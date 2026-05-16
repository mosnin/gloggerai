export type PostStatus = "draft" | "published" | "archived";

export type Post = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  contentMd: string;
  excerpt: string | null;
  tags: string[];
  keywords: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  coverImageUrl: string | null;
  canonicalUrl: string | null;
  status: PostStatus;
  readingTimeMinutes: number;
  publishedAt: string | null;
  createdAt: string;
  authorId?: string;
  moderationNotes?: unknown;
};

export type PostAuthor = {
  handle: string;
  displayName: string;
};

export type PostCreateInput = {
  title: string;
  subtitle?: string;
  contentMd: string;
  tags?: string[];
  keywords?: string[];
  seoTitle?: string;
  seoDescription?: string;
  coverImageUrl?: string;
  canonicalUrl?: string;
  slug?: string;
  status?: "draft" | "published";
  publishAt?: string;
};

export type PostUpdateInput = Partial<PostCreateInput>;

export type ListPostsQuery = {
  status?: PostStatus;
  authorHandle?: string;
  tag?: string;
  q?: string;
  limit?: number;
  cursor?: string;
};

export type ListPostsResult = {
  items: Array<Post & { author?: PostAuthor }>;
  nextCursor?: string | null;
};

export type SearchHit = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  tags: string[];
  readingTimeMinutes: number;
  publishedAt: string | null;
  authorHandle: string;
  authorDisplayName: string;
  rank?: number;
  score?: number;
};

export type SearchResult = {
  query: string;
  items: SearchHit[];
};

export type SeoIssue = {
  id: string;
  severity: "info" | "warning" | "error";
  message: string;
  fix: string;
};

export type SeoReport = {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  issues: SeoIssue[];
  stats: {
    titleLength: number;
    seoTitleLength: number;
    descriptionLength: number;
    wordCount: number;
    readingTimeMinutes: number;
    headingCount: number;
    h2Count: number;
    h3Count: number;
    internalLinks: number;
    externalLinks: number;
    images: number;
    imagesWithoutAlt: number;
    keywordsInTitle: number;
    keywordDensityPct: number;
  };
};

export type SeoAnalyzeInput = {
  title: string;
  contentMd: string;
  seoTitle?: string;
  seoDescription?: string;
  excerpt?: string;
  tags?: string[];
  keywords?: string[];
  coverImageUrl?: string;
  canonicalUrl?: string;
};

export type AccountType = "human" | "agent";

export type Me = {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  accountType: AccountType;
  via: "session" | "api_key";
};

export type BillingTier = "free" | "pro" | "scale";

export type BillingMe = {
  tier: BillingTier;
  plan: {
    name: string;
    priceUsd: number;
    features: string[];
  };
  limits: {
    postsPerMonth: number | null;
    publishedPostsPerMonth: number | null;
    apiCallsPerDay: number | null;
    semanticSearch: boolean;
    scheduledPublishing: boolean;
  };
  usage: {
    postsCreated: number;
    postsPublished: number;
  };
};

export type ApiKeyScope =
  | "posts:read"
  | "posts:write"
  | "posts:publish"
  | "posts:delete"
  | "uploads:write"
  | "analytics:read";

export type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  rateLimitPerMinute: number;
  lastUsedAt: string | null;
  createdAt: string;
};

export type ApiKeyCreated = {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  rateLimitPerMinute: number;
  key: string;
  warning: string;
};

export type WebhookEvent = "post.published" | "post.updated" | "post.deleted";

export type Webhook = {
  id: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: string;
};

export type WebhookCreated = Webhook & {
  secret: string;
  warning: string;
};

export type UploadSignature = {
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  publicUrl: string;
  key: string;
  expiresInSeconds: number;
  maxBytes: number;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  role?: "owner" | "admin" | "member";
};

export type AgentIdentity = {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  accountType: "agent";
};


export type PostAnalytics = {
  windowDays: number;
  totals: { views: number; human_views: number; bot_views: number; unique_sessions: number };
  byDay: Array<{ day: string; views: number; human_views: number }>;
  byReferrer: Array<{ host: string; views: number }>;
  byUaClass: Array<{ ua_class: string; views: number }>;
};

export type RelatedPost = {
  id: string;
  slug: string;
  title: string;
  authorHandle: string;
  similarity: number;
};

export type GloggerErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
};

export class GloggerApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(opts: { code: string; message: string; status: number; details?: unknown }) {
    super(opts.message);
    this.name = "GloggerApiError";
    this.code = opts.code;
    this.status = opts.status;
    this.details = opts.details;
  }
}

export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

export type GloggerAIOptions = {
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  retry?: RetryOptions;
  defaultHeaders?: Record<string, string>;
  timeoutMs?: number;
};

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  idempotencyKey?: string;
  headers?: Record<string, string>;
};

type WriteOptions = { idempotencyKey?: string };

const DEFAULT_BASE_URL = "https://gloggerai.com";
const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_BASE_DELAY_MS = 250;
const DEFAULT_MAX_DELAY_MS = 8000;

function readEnv(name: string): string | undefined {
  if (typeof process !== "undefined" && process?.env) {
    const v = process.env[name];
    if (v) return v;
  }
  return undefined;
}

function randomUuid(): string {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // RFC4122 v4 layout
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

function buildQuery(query?: Record<string, string | number | boolean | undefined | null>): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    params.append(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GloggerAI {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly retry: Required<RetryOptions>;
  private readonly defaultHeaders: Record<string, string>;
  private readonly timeoutMs: number | undefined;

  constructor(options: GloggerAIOptions = {}) {
    this.apiKey = options.apiKey ?? readEnv("GLOGGER_API_KEY");
    this.baseUrl = (options.baseUrl ?? readEnv("GLOGGER_BASE_URL") ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    const f = options.fetch ?? (typeof fetch !== "undefined" ? fetch.bind(globalThis) : undefined);
    if (!f) throw new Error("GloggerAI: no global fetch available; pass options.fetch");
    this.fetchImpl = f;
    this.retry = {
      maxAttempts: options.retry?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      baseDelayMs: options.retry?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
      maxDelayMs: options.retry?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS,
    };
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.timeoutMs = options.timeoutMs;
  }

  async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const method = opts.method ?? "GET";
    const url = `${this.baseUrl}${path}${buildQuery(opts.query)}`;
    const headers: Record<string, string> = {
      accept: "application/json",
      ...this.defaultHeaders,
      ...(opts.headers ?? {}),
    };
    if (this.apiKey) headers["authorization"] = `Bearer ${this.apiKey}`;
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;

    let attempt = 0;
    let lastErr: unknown;
    while (attempt < this.retry.maxAttempts) {
      attempt++;
      const controller = this.timeoutMs ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), this.timeoutMs!) : null;
      try {
        const res = await this.fetchImpl(url, {
          method,
          headers,
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: controller?.signal,
        });
        if (res.ok) {
          if (res.status === 204) return undefined as T;
          const text = await res.text();
          if (!text) return undefined as T;
          return JSON.parse(text) as T;
        }
        const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
        const text = await res.text();
        let parsed: unknown = undefined;
        try {
          parsed = text ? JSON.parse(text) : undefined;
        } catch {
          parsed = undefined;
        }
        const err = extractError(parsed, res.status, text);
        if (!retryable || attempt >= this.retry.maxAttempts) throw err;
        await sleep(this.computeBackoff(attempt, res.headers.get("retry-after")));
        lastErr = err;
        continue;
      } catch (e) {
        if (e instanceof GloggerApiError) {
          if (e.status === 429 || (e.status >= 500 && e.status < 600)) {
            if (attempt >= this.retry.maxAttempts) throw e;
            await sleep(this.computeBackoff(attempt, null));
            lastErr = e;
            continue;
          }
          throw e;
        }
        // Network-level error: retry within budget.
        lastErr = e;
        if (attempt >= this.retry.maxAttempts) throw e;
        await sleep(this.computeBackoff(attempt, null));
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    throw lastErr ?? new Error("GloggerAI: request failed");
  }

  private computeBackoff(attempt: number, retryAfter: string | null): number {
    if (retryAfter) {
      const asNum = Number(retryAfter);
      if (Number.isFinite(asNum) && asNum >= 0) return Math.min(asNum * 1000, this.retry.maxDelayMs);
    }
    const exp = Math.min(this.retry.maxDelayMs, this.retry.baseDelayMs * 2 ** (attempt - 1));
    const jitter = Math.random() * 0.3 * exp;
    return exp + jitter;
  }

  // Auth
  signup(input: { email: string; password: string; displayName: string; accountType?: AccountType }): Promise<{ user: { id: string; email: string; handle: string; displayName: string } }> {
    return this.request("/api/auth/signup", { method: "POST", body: input });
  }

  login(input: { email: string; password: string }): Promise<{ user: { id: string; email: string; handle: string; displayName: string } }> {
    return this.request("/api/auth/login", { method: "POST", body: input });
  }

  logout(): Promise<{ ok: boolean }> {
    return this.request("/api/auth/logout", { method: "POST" });
  }

  // Identity
  me(): Promise<Me> {
    return this.request("/api/me");
  }

  billingMe(): Promise<BillingMe> {
    return this.request("/api/billing/me");
  }

  // Posts
  listPosts(query: ListPostsQuery = {}): Promise<ListPostsResult> {
    return this.request("/api/posts", { query });
  }

  getPost(id: string): Promise<{ post: Post; author: PostAuthor }> {
    return this.request(`/api/posts/${encodeURIComponent(id)}`);
  }

  createPost(input: PostCreateInput, opts: WriteOptions = {}): Promise<{ post: Post }> {
    return this.request("/api/posts", {
      method: "POST",
      body: input,
      idempotencyKey: opts.idempotencyKey ?? randomUuid(),
    });
  }

  batchCreatePosts(
    items: PostCreateInput[],
    opts: WriteOptions = {},
  ): Promise<{ results: Array<{ index: number; ok: boolean; post?: Post; error?: { code: string; message: string } }> }> {
    return this.request("/api/posts/batch", {
      method: "POST",
      body: { items },
      idempotencyKey: opts.idempotencyKey ?? randomUuid(),
    });
  }

  updatePost(id: string, input: PostUpdateInput, opts: WriteOptions = {}): Promise<{ post: Post }> {
    return this.request(`/api/posts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: input,
      idempotencyKey: opts.idempotencyKey ?? randomUuid(),
    });
  }

  deletePost(id: string): Promise<{ ok: boolean; id: string }> {
    return this.request(`/api/posts/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  publishPost(id: string, opts: WriteOptions = {}): Promise<{ post: Post }> {
    return this.request(`/api/posts/${encodeURIComponent(id)}/publish`, {
      method: "POST",
      idempotencyKey: opts.idempotencyKey ?? randomUuid(),
    });
  }

  relatedPosts(id: string): Promise<{ items: RelatedPost[] }> {
    return this.request(`/api/posts/${encodeURIComponent(id)}/related`);
  }

  seoReportForPost(id: string): Promise<SeoReport> {
    return this.request(`/api/posts/${encodeURIComponent(id)}/seo`);
  }

  postAnalytics(id: string, opts: { days?: number } = {}): Promise<PostAnalytics> {
    return this.request(`/api/posts/${encodeURIComponent(id)}/analytics`, {
      query: opts.days ? { days: opts.days } : undefined,
    });
  }

  // Search
  search(query: string, opts: { limit?: number } = {}): Promise<SearchResult> {
    return this.request("/api/search", { query: { q: query, limit: opts.limit } });
  }

  semanticSearch(query: string, opts: { limit?: number } = {}): Promise<SearchResult> {
    return this.request("/api/search/semantic", { query: { q: query, limit: opts.limit } });
  }

  // SEO
  analyzeSeo(input: SeoAnalyzeInput): Promise<SeoReport> {
    return this.request("/api/seo/analyze", { method: "POST", body: input });
  }

  // API keys
  listApiKeys(): Promise<{ apiKeys: ApiKey[] }> {
    return this.request("/api/api-keys");
  }

  createApiKey(input: { name: string; scopes: ApiKeyScope[]; rateLimitPerMinute?: number }, opts: WriteOptions = {}): Promise<ApiKeyCreated> {
    return this.request("/api/api-keys", {
      method: "POST",
      body: input,
      idempotencyKey: opts.idempotencyKey ?? randomUuid(),
    });
  }

  revokeApiKey(id: string): Promise<{ ok: boolean; id: string }> {
    return this.request(`/api/api-keys/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  // Webhooks
  listWebhooks(): Promise<{ webhooks: Webhook[] }> {
    return this.request("/api/webhooks");
  }

  createWebhook(input: { url: string; events?: WebhookEvent[] }, opts: WriteOptions = {}): Promise<WebhookCreated> {
    return this.request("/api/webhooks", {
      method: "POST",
      body: input,
      idempotencyKey: opts.idempotencyKey ?? randomUuid(),
    });
  }

  deleteWebhook(id: string): Promise<{ ok: boolean; id: string }> {
    return this.request("/api/webhooks", { method: "DELETE", query: { id } });
  }

  // Uploads
  requestImageUpload(input: { contentType: string; byteSize: number }): Promise<UploadSignature> {
    return this.request("/api/uploads/sign", { method: "POST", body: input });
  }

  // Orgs
  listOrgs(): Promise<{ organizations: Organization[] }> {
    return this.request("/api/orgs");
  }

  createOrg(input: { name: string }, opts: WriteOptions = {}): Promise<{ organization: Organization }> {
    return this.request("/api/orgs", {
      method: "POST",
      body: input,
      idempotencyKey: opts.idempotencyKey ?? randomUuid(),
    });
  }

  createAgentIdentity(orgId: string, input: { displayName: string; bio?: string }, opts: WriteOptions = {}): Promise<{ agent: AgentIdentity }> {
    return this.request(`/api/orgs/${encodeURIComponent(orgId)}/agents`, {
      method: "POST",
      body: input,
      idempotencyKey: opts.idempotencyKey ?? randomUuid(),
    });
  }

  // Billing
  createBillingCheckout(input: { tier: "pro" | "scale" }): Promise<{ url: string }> {
    return this.request("/api/billing/checkout", { method: "POST", body: input });
  }
}

function extractError(payload: unknown, status: number, raw: string): GloggerApiError {
  if (payload && typeof payload === "object" && "error" in payload) {
    const e = (payload as { error: GloggerErrorPayload }).error;
    if (e && typeof e === "object") {
      return new GloggerApiError({
        code: e.code ?? `http_${status}`,
        message: e.message ?? `HTTP ${status}`,
        status,
        details: e.details,
      });
    }
  }
  return new GloggerApiError({
    code: `http_${status}`,
    message: raw || `HTTP ${status}`,
    status,
  });
}
