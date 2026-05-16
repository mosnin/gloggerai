import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/api/auth-guard";
import { fail, ok } from "@/lib/api/response";
import { createCheckoutSession } from "@/lib/billing/stripe";
import { env } from "@/lib/env";

const Body = z.object({ tier: z.enum(["pro", "scale"]) });

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  if (auth.kind !== "session") return fail("session_required", "Checkout requires a signed-in session", 403);
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("invalid_body", "Invalid request body", 422, parsed.error.flatten());

  const priceId = parsed.data.tier === "pro" ? env.STRIPE_PRO_PRICE_ID : env.STRIPE_SCALE_PRICE_ID;
  if (!env.STRIPE_SECRET_KEY || !priceId) return fail("billing_not_configured", "Stripe not configured", 503);

  const base = env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const session = await createCheckoutSession({
    customerEmail: auth.user.email,
    priceId,
    successUrl: `${base}/dashboard?upgraded=${parsed.data.tier}`,
    cancelUrl: `${base}/dashboard`,
    clientReferenceId: auth.user.id,
  });
  return ok({ url: session.url });
}
