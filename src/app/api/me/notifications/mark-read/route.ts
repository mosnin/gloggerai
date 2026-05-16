import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/api/auth-guard";
import { fail, ok } from "@/lib/api/response";
import { markRead } from "@/lib/engagement/notifications";

const Body = z.object({ ids: z.array(z.string().uuid()).optional() });

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("invalid_body", "Invalid request body", 422, parsed.error.flatten());
  const updated = await markRead({ userId: auth.user.id, ids: parsed.data.ids });
  return ok({ updated });
}
