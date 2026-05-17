import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { webhooks } from "@/db/schema";
import { authenticate } from "@/lib/api/auth-guard";
import { requireCsrf } from "@/lib/api/csrf";
import { checkIdempotency, storeIdempotent } from "@/lib/api/idempotency";
import { validateOutboundUrl } from "@/lib/security/url-allowlist";
import { fail, ok } from "@/lib/api/response";

const KNOWN_EVENTS = [
  "post.published",
  "post.updated",
  "post.deleted",
  "comment.created",
  "comment.deleted",
  "claps.threshold",
] as const;

const CreateBody = z.object({
  url: z.string().url(),
  events: z.array(z.enum(KNOWN_EVENTS)).default([]),
});

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const rows = await db
    .select({
      id: webhooks.id,
      url: webhooks.url,
      events: webhooks.events,
      active: webhooks.active,
      createdAt: webhooks.createdAt,
    })
    .from(webhooks)
    .where(eq(webhooks.userId, auth.user.id))
    .orderBy(desc(webhooks.createdAt));
  return ok({ webhooks: rows });
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const csrf = await requireCsrf(req);
  if (csrf) return csrf;
  const apiKeyId = auth.kind === "api_key" ? auth.key.id : null;
  const idemp = await checkIdempotency(req, apiKeyId);
  if (idemp.cached) return idemp.cached;

  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("invalid_body", "Invalid request body", 422, parsed.error.flatten());

  // SSRF guard. The DNS-resolution check happens again at delivery time
  // (handleDeliverWebhook) to defeat DNS rebinding; this layer rejects the
  // obvious bad inputs at registration so we don't store unusable URLs.
  const urlCheck = validateOutboundUrl(parsed.data.url);
  if (!urlCheck.ok) return fail("invalid_webhook_url", urlCheck.reason, 422);

  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const [row] = await db
    .insert(webhooks)
    .values({ userId: auth.user.id, url: parsed.data.url, events: parsed.data.events, secret })
    .returning();
  const body = {
    id: row.id,
    url: row.url,
    events: row.events,
    active: row.active,
    secret,
    warning: "Save the signing secret now — it won't be shown again.",
  };
  if (idemp.key && apiKeyId) await storeIdempotent(idemp.key, apiKeyId, "POST", "/api/webhooks", 201, body);
  return ok(body, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const csrf = await requireCsrf(req);
  if (csrf) return csrf;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return fail("missing_id", "id query param required", 422);
  const res = await db
    .delete(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.userId, auth.user.id)))
    .returning({ id: webhooks.id });
  if (res.length === 0) return fail("not_found", "Webhook not found", 404);
  return ok({ ok: true, id });
}
