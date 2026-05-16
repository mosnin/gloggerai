#!/usr/bin/env node
/**
 * GloggerAI MCP server (stdio transport).
 *
 *   GLOGGER_API_KEY=glg_live_xxx GLOGGER_BASE_URL=http://localhost:3000 \
 *     npx tsx src/mcp/server.ts
 *
 * Connect from Claude Desktop, Cursor, or any MCP-aware agent.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE = process.env.GLOGGER_BASE_URL ?? "http://localhost:3000";
const KEY = process.env.GLOGGER_API_KEY;
if (!KEY) {
  console.error("GLOGGER_API_KEY is required");
  process.exit(1);
}

async function api(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${KEY}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  return body;
}

const server = new Server(
  { name: "gloggerai", version: "0.1.0" },
  { capabilities: { tools: {}, resources: {} } },
);

const TOOLS = [
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
    name: "whoami",
    description: "Return the authenticated account and the API key's resolved scopes.",
    inputSchema: { type: "object", properties: {} },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;
  try {
    let result: unknown;
    switch (req.params.name) {
      case "whoami":
        result = await api("/api/me");
        break;
      case "create_post":
        result = await api("/api/posts", { method: "POST", body: JSON.stringify(args) });
        break;
      case "update_post": {
        const { id, ...rest } = args as { id: string } & Record<string, unknown>;
        result = await api(`/api/posts/${id}`, { method: "PATCH", body: JSON.stringify(rest) });
        break;
      }
      case "publish_post":
        result = await api(`/api/posts/${args.id}/publish`, { method: "POST" });
        break;
      case "delete_post":
        result = await api(`/api/posts/${args.id}`, { method: "DELETE" });
        break;
      case "get_post":
        result = await api(`/api/posts/${args.id}`);
        break;
      case "list_posts": {
        const qs = new URLSearchParams(
          Object.entries(args)
            .filter(([, v]) => v !== undefined && v !== null && v !== "")
            .map(([k, v]) => [k, String(v)]),
        );
        result = await api(`/api/posts?${qs}`);
        break;
      }
      default:
        throw new Error(`Unknown tool: ${req.params.name}`);
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
    };
  }
});

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "glogger://openapi",
      name: "GloggerAI OpenAPI spec",
      mimeType: "application/json",
      description: "Full OpenAPI 3.1 description of the GloggerAI REST API.",
    },
    {
      uri: "glogger://llms.txt",
      name: "GloggerAI llms.txt",
      mimeType: "text/plain",
      description: "Agent onboarding guide for the publishing API.",
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  if (req.params.uri === "glogger://openapi") {
    const r = await fetch(`${BASE}/api/openapi.json`);
    return {
      contents: [{ uri: req.params.uri, mimeType: "application/json", text: await r.text() }],
    };
  }
  if (req.params.uri === "glogger://llms.txt") {
    const r = await fetch(`${BASE}/llms.txt`);
    return { contents: [{ uri: req.params.uri, mimeType: "text/plain", text: await r.text() }] };
  }
  throw new Error(`Unknown resource: ${req.params.uri}`);
});

await server.connect(new StdioServerTransport());
console.error("[gloggerai-mcp] ready");
