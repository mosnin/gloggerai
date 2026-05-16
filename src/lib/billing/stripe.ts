/**
 * Minimal Stripe REST client. We hit only the few endpoints we need
 * (checkout sessions, customer portal, webhook signature verify) without
 * pulling in the full `stripe` package.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

const API = "https://api.stripe.com/v1";

function form(body: Record<string, string | undefined>): string {
  return Object.entries(body)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`)
    .join("&");
}

async function call<T>(path: string, body: Record<string, string | undefined>): Promise<T> {
  if (!env.STRIPE_SECRET_KEY) throw new Error("stripe not configured");
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form(body),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`stripe ${res.status}: ${txt}`);
  return JSON.parse(txt) as T;
}

export async function createCheckoutSession(opts: {
  customerEmail: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  clientReferenceId: string;
}): Promise<{ id: string; url: string }> {
  const res = await call<{ id: string; url: string }>("/checkout/sessions", {
    mode: "subscription",
    "line_items[0][price]": opts.priceId,
    "line_items[0][quantity]": "1",
    customer_email: opts.customerEmail,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: opts.clientReferenceId,
    allow_promotion_codes: "true",
  });
  return res;
}

export async function createPortalSession(opts: { customerId: string; returnUrl: string }) {
  return call<{ url: string }>("/billing_portal/sessions", {
    customer: opts.customerId,
    return_url: opts.returnUrl,
  });
}

/**
 * Verify Stripe-Signature header per https://stripe.com/docs/webhooks/signatures.
 */
export function verifyWebhook(payload: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((s) => s.split("=") as [string, string]));
  const ts = parts.t;
  const v1 = parts.v1;
  if (!ts || !v1) return false;
  const expected = createHmac("sha256", secret).update(`${ts}.${payload}`).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
