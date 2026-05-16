import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { posts, webhooks, webhookDeliveries } from "@/db/schema";
import { moderateContent } from "@/lib/posts/moderation";
import { upsertPostEmbedding } from "@/lib/embeddings/service";
import { log } from "@/lib/observability/logger";

export async function handlePublishScheduled(payload: { postId: string }): Promise<void> {
  const [post] = await db.select().from(posts).where(eq(posts.id, payload.postId)).limit(1);
  if (!post) return;
  if (post.status !== "draft") return;
  const moderation = await moderateContent(post.title, post.contentMd);
  const status = moderation.status === "rejected" ? "draft" : "published";
  await db
    .update(posts)
    .set({
      status,
      moderationStatus: moderation.status,
      moderationNotes: moderation.notes,
      publishedAt: status === "published" ? new Date() : null,
      publishAt: null,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, post.id));
  if (status === "published") {
    await upsertPostEmbedding({ postId: post.id, title: post.title, body: post.contentMd }).catch(() => {});
    await fanOutEvent({ userId: post.authorId, event: "post.published", data: { postId: post.id, slug: post.slug } });
  }
}

export async function handleEmbedPost(payload: { postId: string }): Promise<void> {
  const [post] = await db.select().from(posts).where(eq(posts.id, payload.postId)).limit(1);
  if (!post) return;
  await upsertPostEmbedding({ postId: post.id, title: post.title, body: post.contentMd });
}

export async function handleDeliverWebhook(payload: { deliveryId: string }): Promise<void> {
  const [delivery] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, payload.deliveryId)).limit(1);
  if (!delivery) return;
  const [hook] = await db.select().from(webhooks).where(eq(webhooks.id, delivery.webhookId)).limit(1);
  if (!hook || !hook.active) return;

  const body = JSON.stringify({ event: delivery.event, data: delivery.payload, id: delivery.id });
  const ts = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", hook.secret).update(`${ts}.${body}`).digest("hex");

  const res = await fetch(hook.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-gloggerai-event": delivery.event,
      "x-gloggerai-delivery": delivery.id,
      "x-gloggerai-timestamp": ts,
      "x-gloggerai-signature": `t=${ts},v1=${signature}`,
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const txt = await res.text().catch(() => "");
  await db
    .update(webhookDeliveries)
    .set({
      status: res.status,
      responseBody: txt.slice(0, 2000),
      attempts: delivery.attempts + 1,
      deliveredAt: res.ok ? new Date() : null,
    })
    .where(eq(webhookDeliveries.id, delivery.id));
  if (!res.ok) {
    log.warn("webhook.delivery_failed", {
      deliveryId: delivery.id,
      webhookId: hook.id,
      url: hook.url,
      status: res.status,
      attempts: delivery.attempts + 1,
    });
    throw new Error(`webhook ${res.status}: ${txt.slice(0, 200)}`);
  }
}

export async function fanOutEvent(opts: {
  userId: string;
  event: string;
  data: Record<string, unknown>;
}): Promise<void> {
  const { enqueue } = await import("./queue");
  const hooks = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.userId, opts.userId), eq(webhooks.active, true)));
  for (const hook of hooks) {
    if (hook.events.length && !hook.events.includes(opts.event)) continue;
    const [delivery] = await db
      .insert(webhookDeliveries)
      .values({ webhookId: hook.id, event: opts.event, payload: opts.data })
      .returning();
    await enqueue({ kind: "deliver_webhook", payload: { deliveryId: delivery.id } });
  }
}
