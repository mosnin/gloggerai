import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { env } from "@/lib/env";
import { verifyWebhook } from "@/lib/billing/stripe";
import { log } from "@/lib/observability/logger";
import { requestId } from "@/lib/observability/request-id";

type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

function tierFromPriceId(priceId: string | undefined): "pro" | "scale" | null {
  if (!priceId) return null;
  if (priceId === env.STRIPE_PRO_PRICE_ID) return "pro";
  if (priceId === env.STRIPE_SCALE_PRICE_ID) return "scale";
  return null;
}

async function userIdByStripeCustomerId(customerId: string): Promise<string | null> {
  const res = await db.execute(sql`
    SELECT user_id::text AS user_id
    FROM subscriptions
    WHERE stripe_customer_id = ${customerId}
    LIMIT 1
  `);
  const row = res.rows[0] as { user_id?: string } | undefined;
  return row?.user_id ?? null;
}

export async function POST(req: NextRequest) {
  const rid = requestId(req);
  if (!env.STRIPE_WEBHOOK_SECRET) return new NextResponse("not configured", { status: 503 });
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!verifyWebhook(raw, sig, env.STRIPE_WEBHOOK_SECRET)) {
    return new NextResponse("bad signature", { status: 400 });
  }
  const event = JSON.parse(raw) as StripeEvent;
  log.info("billing.webhook.received", { rid, eventId: event.id, type: event.type });

  // Idempotency — store before processing.
  await db.execute(sql`
    INSERT INTO stripe_events (id, type, payload)
    VALUES (${event.id}, ${event.type}, ${JSON.stringify(event)}::jsonb)
    ON CONFLICT (id) DO NOTHING
  `);

  switch (event.type) {
    case "checkout.session.completed": {
      const o = event.data.object as {
        client_reference_id?: string;
        customer?: string;
        subscription?: string;
      };
      const userId = o.client_reference_id;
      if (!userId) break;
      // Do NOT set tier here — let customer.subscription.{created,updated} do it.
      // We just record the Stripe customer/subscription IDs so the next event
      // can match. If subscription.created already arrived (race), we keep the
      // tier it wrote.
      await db.execute(sql`
        INSERT INTO subscriptions (user_id, tier, status, stripe_customer_id, stripe_subscription_id)
        VALUES (${userId}, 'free'::plan_tier, 'active'::subscription_status, ${o.customer ?? null}, ${o.subscription ?? null})
        ON CONFLICT (user_id) DO UPDATE SET
          stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, subscriptions.stripe_customer_id),
          stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, subscriptions.stripe_subscription_id),
          updated_at = now()
      `);
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.created": {
      const o = event.data.object as {
        id: string;
        status: string;
        customer?: string;
        current_period_end: number;
        items: { data: Array<{ price: { id: string } }> };
      };
      const priceId = o.items?.data?.[0]?.price?.id;
      const tier = tierFromPriceId(priceId);
      if (!tier) break;

      // First try to match an existing row by stripe_subscription_id (created
      // either by checkout.session.completed earlier, or by a prior update).
      const updated = await db.execute(sql`
        UPDATE subscriptions SET
          tier = ${tier}::plan_tier,
          status = ${o.status}::subscription_status,
          stripe_customer_id = COALESCE(${o.customer ?? null}, stripe_customer_id),
          current_period_end = to_timestamp(${o.current_period_end}),
          updated_at = now()
        WHERE stripe_subscription_id = ${o.id}
        RETURNING user_id
      `);

      if (updated.rows.length === 0) {
        // No row yet — this event arrived before checkout.session.completed.
        // Try to resolve a user_id via the customer id; if we can't, we drop
        // the event (the matching checkout.session.completed will create the
        // row, and a subsequent subscription.updated will set the tier).
        const userId = o.customer ? await userIdByStripeCustomerId(o.customer) : null;
        if (!userId) {
          log.warn("billing.webhook.no_match", {
            rid,
            eventId: event.id,
            subscriptionId: o.id,
            customerId: o.customer ?? null,
          });
          break;
        }
        await db.execute(sql`
          INSERT INTO subscriptions (user_id, tier, status, stripe_customer_id, stripe_subscription_id, current_period_end)
          VALUES (
            ${userId},
            ${tier}::plan_tier,
            ${o.status}::subscription_status,
            ${o.customer ?? null},
            ${o.id},
            to_timestamp(${o.current_period_end})
          )
          ON CONFLICT (user_id) DO UPDATE SET
            tier = EXCLUDED.tier,
            status = EXCLUDED.status,
            stripe_customer_id = EXCLUDED.stripe_customer_id,
            stripe_subscription_id = EXCLUDED.stripe_subscription_id,
            current_period_end = EXCLUDED.current_period_end,
            updated_at = now()
        `);
      }
      break;
    }
    case "customer.subscription.deleted": {
      const o = event.data.object as { id: string };
      await db.execute(sql`
        UPDATE subscriptions SET
          tier = 'free'::plan_tier,
          status = 'canceled'::subscription_status,
          updated_at = now()
        WHERE stripe_subscription_id = ${o.id}
      `);
      break;
    }
  }

  log.info("billing.webhook.processed", { rid, eventId: event.id, type: event.type });
  return NextResponse.json({ received: true });
}
