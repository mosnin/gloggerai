import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { webhookDeliveries, webhooks } from "@/db/schema";
import { authenticate } from "@/lib/api/auth-guard";
import { fail, ok } from "@/lib/api/response";
import { enqueue } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; deliveryId: string }> },
) {
  const { id, deliveryId } = await params;
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const [row] = await db
    .select({ delivery: webhookDeliveries, hook: webhooks })
    .from(webhookDeliveries)
    .innerJoin(webhooks, eq(webhooks.id, webhookDeliveries.webhookId))
    .where(
      and(
        eq(webhookDeliveries.id, deliveryId),
        eq(webhookDeliveries.webhookId, id),
        eq(webhooks.userId, auth.user.id),
      ),
    )
    .limit(1);
  if (!row) return fail("not_found", "Delivery not found", 404);

  const [replay] = await db
    .insert(webhookDeliveries)
    .values({
      webhookId: row.delivery.webhookId,
      event: row.delivery.event,
      payload: row.delivery.payload,
    })
    .returning();
  const job = await enqueue({ kind: "deliver_webhook", payload: { deliveryId: replay.id } });
  return ok({ ok: true, deliveryId: replay.id, jobId: job.id }, { status: 202 });
}
