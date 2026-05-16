import { NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/auth/api-key";
import { handleSseRequest, siteBaseUrl } from "@/mcp/sse-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function check(req: NextRequest): Promise<Response | { token: string }> {
  const auth = req.headers.get("authorization") ?? "";
  const [scheme, token] = auth.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return new Response(JSON.stringify({ error: { code: "unauthenticated", message: "Bearer api key required" } }), {
      status: 401,
      headers: { "content-type": "application/json", "www-authenticate": "Bearer" },
    });
  }
  const verified = await authenticateApiKey(token.trim());
  if (!verified) {
    return new Response(JSON.stringify({ error: { code: "invalid_api_key", message: "API key invalid or revoked" } }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return { token: token.trim() };
}

async function handle(req: NextRequest): Promise<Response> {
  const c = await check(req);
  if (c instanceof Response) return c;
  return handleSseRequest(req, { apiKey: c.token, baseUrl: siteBaseUrl() });
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
