import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/api/auth-guard";
import { fail, ok } from "@/lib/api/response";
import { listNotifications } from "@/lib/engagement/notifications";

const Query = z.object({
  onlyUnread: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const url = new URL(req.url);
  const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return fail("invalid_query", "Invalid query parameters", 422, parsed.error.flatten());
  const result = await listNotifications({
    userId: auth.user.id,
    onlyUnread: parsed.data.onlyUnread === "true",
    limit: parsed.data.limit,
    cursor: parsed.data.cursor,
  });
  return ok(result);
}
