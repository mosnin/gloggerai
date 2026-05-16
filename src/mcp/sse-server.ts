import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { TOOLS, dispatchTool } from "./tools";
import { env } from "@/lib/env";

export type SseAuth = { apiKey: string; baseUrl: string };

export async function handleSseRequest(req: Request, auth: SseAuth): Promise<Response> {
  const server = new Server(
    { name: "gloggerai", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  async function api(path: string, init: RequestInit = {}): Promise<unknown> {
    const res = await fetch(`${auth.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${auth.apiKey}`,
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch {}
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
    return body;
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (r) => {
    const args = (r.params.arguments ?? {}) as Record<string, unknown>;
    try {
      const result = await dispatchTool(r.params.name, args, api);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
      };
    }
  });

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export function siteBaseUrl(): string {
  return env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
}
