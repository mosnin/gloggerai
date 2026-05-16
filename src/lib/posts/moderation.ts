import { env } from "@/lib/env";
import { log } from "@/lib/observability/logger";

export type ModerationResult = {
  status: "approved" | "flagged" | "rejected";
  notes: string | null;
};

const BLOCKED = [
  /child[\s_-]*sex/i,
  /\bcsam\b/i,
  /how to make (a )?bomb/i,
];

export async function moderateContent(title: string, body: string): Promise<ModerationResult> {
  const text = `${title}\n\n${body}`;
  for (const pat of BLOCKED) {
    if (pat.test(text)) {
      log.warn("moderation.rejected", { rule: "local", pattern: pat.source });
      return { status: "rejected", notes: `local rule matched: ${pat.source}` };
    }
  }

  if (!env.OPENAI_API_KEY) return { status: "approved", notes: null };

  try {
    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: "omni-moderation-latest", input: text.slice(0, 8000) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { status: "approved", notes: `moderation upstream ${res.status}` };
    const data = (await res.json()) as { results?: Array<{ flagged: boolean; categories: Record<string, boolean> }> };
    const r = data.results?.[0];
    if (!r) return { status: "approved", notes: null };
    if (r.flagged) {
      const cats = Object.entries(r.categories).filter(([, v]) => v).map(([k]) => k);
      const severe = cats.some((c) => /sexual\/minors|illicit\/violent|self-harm/.test(c));
      const status = severe ? "rejected" : "flagged";
      log.warn("moderation.openai_flagged", { status, categories: cats });
      return { status, notes: cats.join(",") };
    }
    return { status: "approved", notes: null };
  } catch (err) {
    log.warn("moderation.openai_error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { status: "approved", notes: "moderation timeout" };
  }
}
