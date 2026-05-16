import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/api/auth-guard";
import { fail, ok } from "@/lib/api/response";
import { analyzeContent } from "@/lib/posts/moderation";

export const dynamic = "force-dynamic";

const Body = z.object({
  title: z.string().min(1).max(500),
  contentMd: z.string().min(1).max(200_000),
});

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  if (auth.kind !== "api_key") return fail("api_key_required", "API key required", 401);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("invalid_body", "Invalid request body", 422, parsed.error.flatten());

  const result = await analyzeContent(parsed.data.title, parsed.data.contentMd);
  return ok(result);
}
