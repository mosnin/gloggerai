import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { env } from "@/lib/env";
import { verifyWebhook } from "@/lib/billing/stripe";

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

export async function POST(req: NextRequest) {
  if (!env.STRIPE_WEBHOOK_SECRET) return new NextResponse("not configured", { status: 503 });
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!verifyWebhook(raw, sig, env.STRIPE_WEBHOOK_SECRET)) {
    return new NextResponse("bad signature", { status: 400 });
  }
  const event = JSON.parse(raw) as StripeEvent;

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
      await db.execute(sql`
        INSERT INTO subscriptions (user_id, tier, status, stripe_customer_id, stripe_subscription_id)
        VALUES (${userId}, 'pro', 'active', ${o.customer ?? null}, ${o.subscription ?? null})
        ON CONFLICT (user_id) DO UPDATE SET
          stripe_customer_id = EXCLUDED.stripe_customer_id,
          stripe_subscription_id = EXCLUDED.stripe_subscription_id,
          status = 'active',
          updated_at = now()
      `);
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.created": {
      const o = event.data.object as {
        id: string;
        status: string;
        current_period_end: number;
        items: { data: Array<{ price: { id: string } }> };
      };
      const priceId = o.items?.data?.[0]?.price?.id;
      const tier = tierFromPriceId(priceId);
      if (!tier) break;
      await db.execute(sql`
        UPDATE subscriptions SET
          tier = ${tier}::plan_tier,
          status = ${o.status}::subscription_status,
          current_period_end = to_timestamp(${o.current_period_end}),
          updated_at = now()
        WHERE stripe_subscription_id = ${o.id}
      `);
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

  return NextResponse.json({ received: true });
}
