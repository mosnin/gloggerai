/**
 * Transactional email via Resend (https://resend.com/docs/api-reference).
 * No SDK dependency — just fetch. Falls back to console-log in dev when
 * RESEND_API_KEY isn't set, so flows are testable without provisioning.
 */
import { env } from "@/lib/env";
import { log } from "@/lib/observability/logger";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  tag?: string;
};

export type SendResult = { delivered: boolean; provider: "resend" | "console"; id?: string };

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    log.info("email.console_only", { to: msg.to, subject: msg.subject, tag: msg.tag });
    if (process.env.NODE_ENV !== "production") {
      console.log(`\n[email→${msg.to}] ${msg.subject}\n${msg.text}\n`);
    }
    return { delivered: false, provider: "console" };
  }

  const body: Record<string, unknown> = {
    from: env.EMAIL_FROM,
    to: [msg.to],
    subject: msg.subject,
    text: msg.text,
    ...(msg.html ? { html: msg.html } : {}),
    ...(env.EMAIL_REPLY_TO ? { reply_to: env.EMAIL_REPLY_TO } : {}),
    ...(msg.tag ? { tags: [{ name: "category", value: msg.tag }] } : {}),
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    log.error("email.send_failed", { to: msg.to, tag: msg.tag, status: res.status, error: txt.slice(0, 500) });
    return { delivered: false, provider: "resend" };
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  log.info("email.sent", { to: msg.to, tag: msg.tag, id: data.id });
  return { delivered: true, provider: "resend", id: data.id };
}
