import { NextRequest } from "next/server";
import { z } from "zod";
import { semanticSearch } from "@/lib/embeddings/service";
import { authenticate } from "@/lib/api/auth-guard";
import { requireFeature } from "@/lib/billing/service";
import { fail, ok } from "@/lib/api/response";

const Q = z.object({
  q: z.string().min(2).max(500),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = Q.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return fail("invalid_query", "Invalid query parameters", 422);
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const feat = await requireFeature(auth.user.id, "semanticSearch");
  if (!feat.ok) return fail("plan_feature_required", feat.reason, 402);
  const items = await semanticSearch({ query: parsed.data.q, limit: parsed.data.limit });
  return ok({ query: parsed.data.q, items });
}
