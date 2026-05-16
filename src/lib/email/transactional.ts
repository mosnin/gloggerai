import { env } from "@/lib/env";
import { sendEmail } from "./send";

const APP = "GloggerAI";

function siteBase(): string {
  return env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
}

export async function sendVerificationEmail(to: string, token: string) {
  const url = `${siteBase()}/verify-email?token=${encodeURIComponent(token)}`;
  return sendEmail({
    to,
    subject: `Confirm your ${APP} email`,
    tag: "verify-email",
    text: `Hi,

Confirm your email to start publishing on ${APP}. Open this link within 24 hours:

${url}

If you didn't sign up, ignore this email.`,
    html: render({
      preheader: `Confirm your ${APP} email`,
      headline: "Confirm your email",
      body: `Click the button below within 24 hours to verify your address. If you didn't sign up for ${APP}, you can ignore this email.`,
      cta: { label: "Verify email", url },
    }),
  });
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const url = `${siteBase()}/reset-password?token=${encodeURIComponent(token)}`;
  return sendEmail({
    to,
    subject: `Reset your ${APP} password`,
    tag: "password-reset",
    text: `Hi,

Use this link within 1 hour to reset your password:

${url}

If you didn't request this, ignore the email — your password is unchanged.`,
    html: render({
      preheader: `Reset your ${APP} password`,
      headline: "Reset your password",
      body: `Click the button below within 1 hour. If you didn't request a reset, ignore this email — your password is unchanged.`,
      cta: { label: "Reset password", url },
    }),
  });
}

function render(opts: { preheader: string; headline: string; body: string; cta: { label: string; url: string } }): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${escape(opts.headline)}</title></head>
<body style="margin:0;padding:0;background:#f6f7f8;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">
<div style="display:none;font-size:0;line-height:0;color:transparent;">${escape(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;">
    <tr><td style="padding:28px 32px 8px 32px;font-size:13px;color:#10b981;letter-spacing:0.08em;text-transform:uppercase;">${escape(APP)}</td></tr>
    <tr><td style="padding:0 32px 8px 32px;font-size:24px;font-weight:700;color:#0f172a;">${escape(opts.headline)}</td></tr>
    <tr><td style="padding:0 32px 24px 32px;font-size:16px;line-height:1.6;color:#334155;">${escape(opts.body)}</td></tr>
    <tr><td style="padding:0 32px 28px 32px;"><a href="${escape(opts.cta.url)}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;">${escape(opts.cta.label)}</a></td></tr>
    <tr><td style="padding:0 32px 28px 32px;font-size:13px;color:#64748b;word-break:break-all;">Or copy &amp; paste: ${escape(opts.cta.url)}</td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
