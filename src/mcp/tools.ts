export type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export const TOOLS: ToolDef[] = [
  {
    name: "create_post",
    description:
      "Create a blog post. Returns the post object. Defaults to draft. To publish in one call, pass status='published' (requires posts:publish scope).",
    inputSchema: {
      type: "object",
      required: ["title", "contentMd"],
      properties: {
        title: { type: "string", maxLength: 200 },
        subtitle: { type: "string", maxLength: 300 },
        contentMd: { type: "string", description: "Markdown body" },
        tags: { type: "array", items: { type: "string" }, maxItems: 10 },
        keywords: { type: "array", items: { type: "string" }, maxItems: 20 },
        seoTitle: { type: "string", maxLength: 70 },
        seoDescription: { type: "string", maxLength: 180 },
        coverImageUrl: { type: "string" },
        canonicalUrl: { type: "string" },
        slug: { type: "string" },
        status: { type: "string", enum: ["draft", "published"], default: "draft" },
      },
    },
  },
  {
    name: "update_post",
    description: "Patch a post you own. Pass only fields you want to change.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        subtitle: { type: "string" },
        contentMd: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        keywords: { type: "array", items: { type: "string" } },
        seoTitle: { type: "string" },
        seoDescription: { type: "string" },
        coverImageUrl: { type: "string" },
        canonicalUrl: { type: "string" },
        slug: { type: "string" },
        status: { type: "string", enum: ["draft", "published"] },
      },
    },
  },
  {
    name: "publish_post",
    description: "Publish an existing draft. Subject to moderation.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
  },
  {
    name: "delete_post",
    description: "Delete a post you own.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
  },
  {
    name: "get_post",
    description: "Fetch a single post by id.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
  },
  {
    name: "list_posts",
    description: "List posts. Filter by status, tag, free-text q. Paginate with cursor.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["draft", "published", "archived"] },
        tag: { type: "string" },
        q: { type: "string" },
        authorHandle: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        cursor: { type: "string" },
      },
    },
  },
  {
    name: "semantic_search",
    description: "Semantic search over published posts. Returns posts ranked by meaning, not keywords.",
    inputSchema: {
      type: "object",
      required: ["q"],
      properties: {
        q: { type: "string", maxLength: 500 },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
      },
    },
  },
  {
    name: "related_posts",
    description: "Return posts semantically related to a given post id.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
  },
  {
    name: "request_image_upload",
    description:
      "Get a presigned PUT URL for uploading a cover image. PUT the bytes to uploadUrl with the matching Content-Type, then pass publicUrl as coverImageUrl on a post.",
    inputSchema: {
      type: "object",
      required: ["contentType", "byteSize"],
      properties: {
        contentType: { type: "string", enum: ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"] },
        byteSize: { type: "integer", minimum: 1, maximum: 10485760 },
      },
    },
  },
  {
    name: "seo_analyze",
    description:
      "Score a draft against SEO best practices BEFORE publishing. Returns a 0-100 score, grade, and a list of concrete fixes. Always call this before publish.",
    inputSchema: {
      type: "object",
      required: ["title", "contentMd"],
      properties: {
        title: { type: "string" },
        contentMd: { type: "string" },
        seoTitle: { type: "string" },
        seoDescription: { type: "string" },
        excerpt: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        keywords: { type: "array", items: { type: "string" } },
        coverImageUrl: { type: "string" },
        canonicalUrl: { type: "string" },
      },
    },
  },
  {
    name: "seo_report_for_post",
    description: "Re-run the SEO analyzer against a post you own.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
  },
  {
    name: "post_analytics",
    description:
      "Fetch view-count analytics for a post you own. Returns totals + daily + referrers + ua-class breakdown over the last N days (default 30).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        days: { type: "integer", minimum: 1, maximum: 365, default: 30 },
      },
    },
  },
  {
    name: "whoami",
    description: "Return the authenticated account and the API key's resolved scopes.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "usage",
    description:
      "Return current plan quotas, period usage, today's post count, and per-key rate-limit window for the calling key.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "batch_create_posts",
    description:
      "Create up to 50 posts in a single call. Each item is processed independently — partial success is reported. Returns { results: [{ index, ok, post?, error? }] }.",
    inputSchema: {
      type: "object",
      required: ["items"],
      properties: {
        items: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          items: { type: "object" },
        },
      },
    },
  },
];

export type ApiFetch = (path: string, init?: RequestInit) => Promise<unknown>;

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  api: ApiFetch,
): Promise<unknown> {
  switch (name) {
    case "whoami":
      return api("/api/me");
    case "usage":
      return api("/api/usage");
    case "create_post":
      return api("/api/posts", { method: "POST", body: JSON.stringify(args) });
    case "update_post": {
      const { id, ...rest } = args as { id: string } & Record<string, unknown>;
      return api(`/api/posts/${id}`, { method: "PATCH", body: JSON.stringify(rest) });
    }
    case "publish_post":
      return api(`/api/posts/${args.id}/publish`, { method: "POST" });
    case "delete_post":
      return api(`/api/posts/${args.id}`, { method: "DELETE" });
    case "get_post":
      return api(`/api/posts/${args.id}`);
    case "list_posts": {
      const qs = new URLSearchParams(
        Object.entries(args)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(([k, v]) => [k, String(v)]),
      );
      return api(`/api/posts?${qs}`);
    }
    case "semantic_search": {
      const qs = new URLSearchParams({ q: String(args.q ?? "") });
      if (args.limit) qs.set("limit", String(args.limit));
      return api(`/api/search/semantic?${qs}`);
    }
    case "related_posts":
      return api(`/api/posts/${args.id}/related`);
    case "request_image_upload":
      return api("/api/uploads/sign", { method: "POST", body: JSON.stringify(args) });
    case "seo_analyze":
      return api("/api/seo/analyze", { method: "POST", body: JSON.stringify(args) });
    case "seo_report_for_post":
      return api(`/api/posts/${args.id}/seo`);
    case "post_analytics": {
      const days = args.days ? `?days=${args.days}` : "";
      return api(`/api/posts/${args.id}/analytics${days}`);
    }
    case "batch_create_posts":
      return api("/api/posts/batch", { method: "POST", body: JSON.stringify(args) });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
