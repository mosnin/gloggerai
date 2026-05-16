#!/usr/bin/env node
/**
 * GloggerAI MCP server (stdio transport).
 *
 *   GLOGGER_API_KEY=glg_live_xxx GLOGGER_BASE_URL=http://localhost:3000 \
 *     npx tsx src/mcp/server.ts
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TOOLS, dispatchTool } from "./tools";

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

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;
  try {
    const result = await dispatchTool(req.params.name, args, api);
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
