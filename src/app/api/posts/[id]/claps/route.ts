import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/api/auth-guard";
import { getCurrentUser } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api/response";
import { getClapState, upsertClap } from "@/lib/engagement/claps";

const ClapBody = z.object({ count: z.number().int().min(1).max(50) });

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser().catch(() => null);
  const state = await getClapState({ postId: id, userId: user?.id ?? null });
  return ok(state);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const parsed = ClapBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("invalid_body", "Invalid request body", 422, parsed.error.flatten());
  try {
    const result = await upsertClap({ postId: id, userId: auth.user.id, count: parsed.data.count });
    return ok(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    if (msg === "post_not_found") return fail("not_found", "Post not found", 404);
    return fail("invalid_count", msg, 422);
  }
}
