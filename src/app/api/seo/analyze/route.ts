import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/api/auth-guard";
import { fail, ok } from "@/lib/api/response";
import { analyzeSeo } from "@/lib/seo/analyzer";

const Body = z.object({
  title: z.string().min(1).max(200),
  contentMd: z.string().min(1).max(200_000),
  seoTitle: z.string().max(120).optional(),
  seoDescription: z.string().max(300).optional(),
  excerpt: z.string().max(300).optional(),
  tags: z.array(z.string()).max(20).optional(),
  keywords: z.array(z.string()).max(20).optional(),
  coverImageUrl: z.string().url().optional(),
  canonicalUrl: z.string().url().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("invalid_body", "Invalid request body", 422, parsed.error.flatten());
  return ok(analyzeSeo(parsed.data));
}
