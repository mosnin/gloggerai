import { NextRequest } from "next/server";
import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { webhookDeliveries, webhooks } from "@/db/schema";
import { authenticate } from "@/lib/api/auth-guard";
import { fail, ok } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const [hook] = await db
    .select({ id: webhooks.id })
    .from(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.userId, auth.user.id)))
    .limit(1);
  if (!hook) return fail("not_found", "Webhook not found", 404);

  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 1), 100);
  const cursor = url.searchParams.get("cursor");
  const conds = [eq(webhookDeliveries.webhookId, id)];
  if (cursor) {
    const d = new Date(cursor);
    if (!Number.isNaN(d.getTime())) conds.push(lt(webhookDeliveries.createdAt, d));
  }

  const rows = await db
    .select({
      id: webhookDeliveries.id,
      event: webhookDeliveries.event,
      status: webhookDeliveries.status,
      responseBody: webhookDeliveries.responseBody,
      attempts: webhookDeliveries.attempts,
      deliveredAt: webhookDeliveries.deliveredAt,
      createdAt: webhookDeliveries.createdAt,
    })
    .from(webhookDeliveries)
    .where(and(...conds))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;
  return ok({ items, nextCursor });
}
