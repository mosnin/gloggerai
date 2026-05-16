import { env } from "@/lib/env";
import { log } from "@/lib/observability/logger";

export type ModerationResult = {
  status: "approved" | "flagged" | "rejected";
  notes: string | null;
};

export type CategoryName =
  | "csam"
  | "sexual_minors"
  | "illegal_violence"
  | "self_harm"
  | "weapons_instructions"
  | "hate_speech"
  | "extremism"
  | "spam"
  | "low_quality";

export type CategoryHit = {
  name: CategoryName;
  severity: 1 | 2 | 3;
  hits: number;
  samples: string[];
};

export type ContentAnalysis = {
  status: "approved" | "flagged" | "rejected";
  categories: CategoryHit[];
  notes: string | null;
  score: number;
};

type Rule = {
  name: CategoryName;
  severity: 1 | 2 | 3;
  patterns: RegExp[];
  keywords?: string[];
};

const RULES: Rule[] = [
  {
    name: "csam",
    severity: 3,
    patterns: [/\bcsam\b/i, /child[\s_-]*(porn|sex|abuse)/i, /\bcp\s+(images|videos|content)\b/i],
  },
  {
    name: "sexual_minors",
    severity: 3,
    patterns: [/(minor|underage|teen|child|kid)s?[\s\S]{0,40}(sex|nude|naked|porn|erotic)/i, /(loli|shota)\b/i],
  },
  {
    name: "illegal_violence",
    severity: 3,
    patterns: [
      /how to (kill|murder|assassinate|behead)/i,
      /step[s]?[\s\-]+to[\s\S]{0,30}(kill|murder)/i,
      /\b(mass\s+shoot(ing|er)|terror\s+attack\s+plan)\b/i,
    ],
  },
  {
    name: "weapons_instructions",
    severity: 3,
    patterns: [
      /how to (make|build|construct)[\s\S]{0,40}(bomb|explosive|ied|pipe[\s\-]bomb|nerve\s+gas|sarin|ricin|anthrax|pathogen)/i,
      /\b(tatp|hmtd|c-4|semtex)\b/i,
      /(synthesi[sz]e|manufactur(e|ing))[\s\S]{0,40}(meth(amphetamine)?|fentanyl|heroin|cocaine)/i,
    ],
  },
  {
    name: "self_harm",
    severity: 2,
    patterns: [
      /how to (commit suicide|kill yourself|end your life)/i,
      /\b(suicide method(s)?|painless\s+ways\s+to\s+die)\b/i,
      /\bpro[\s\-]?(ana|mia)\b/i,
    ],
  },
  {
    name: "hate_speech",
    severity: 2,
    patterns: [
      /\b(kike|spic|chink|gook|wetback|towel\s*head)\b/i,
      /\b(subhuman|untermensch)\b/i,
      /\bgas\s+the\s+\w+/i,
    ],
  },
  {
    name: "extremism",
    severity: 2,
    patterns: [
      /\b(heil\s+hitler|white\s+power|14\s*words|sieg\s+heil)\b/i,
      /\b(jihad\s+against|kill\s+all\s+(infidels|kuffar))\b/i,
      /\bisis\s+recruit/i,
    ],
  },
];

const AFFILIATE_HOSTS =
  /(amzn\.to|amazon\.[a-z.]+\/(dp|gp)|bit\.ly|tinyurl\.com|shorturl\.at|goo\.gl|t\.co|rebrand\.ly|clickbank|cb\.run|impact\.com\/campaign-promo|shareasale\.com\/r\.cfm|cj\.com|linksynergy\.com)/i;

function uniqueSamples(matches: string[], limit = 5): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const key = m.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m.slice(0, 120));
    if (out.length >= limit) break;
  }
  return out;
}

function runRules(text: string): CategoryHit[] {
  const hits: CategoryHit[] = [];
  for (const rule of RULES) {
    const samples: string[] = [];
    let total = 0;
    for (const pat of rule.patterns) {
      const flags = pat.flags.includes("g") ? pat.flags : pat.flags + "g";
      const global = new RegExp(pat.source, flags);
      const found = text.match(global);
      if (found && found.length) {
        total += found.length;
        samples.push(...found);
      }
    }
    if (total > 0) {
      hits.push({ name: rule.name, severity: rule.severity, hits: total, samples: uniqueSamples(samples) });
    }
  }
  return hits;
}

function countLinks(text: string): { all: string[]; affiliate: string[] } {
  const re = /https?:\/\/\S+/gi;
  const all = text.match(re) ?? [];
  const affiliate = all.filter((u) => AFFILIATE_HOSTS.test(u));
  return { all, affiliate };
}

function detectSpam(title: string, body: string): CategoryHit | null {
  const text = `${title}\n${body}`;
  const words = body.trim().split(/\s+/).filter(Boolean);
  const wc = words.length;
  const { all, affiliate } = countLinks(text);
  const phoneMatches = text.match(/(?:\+?\d{1,3}[\s\-.]?)?(?:\(?\d{3}\)?[\s\-.]?)\d{3}[\s\-.]?\d{4}/g) ?? [];
  const clickHere = /click\s+here\s+to/i.test(text);

  const reasons: string[] = [];
  if (wc < 500 && all.length > 8) reasons.push(`${all.length} links in ${wc}-word post`);
  if (phoneMatches.length > 3) reasons.push(`${phoneMatches.length} phone numbers`);
  if (clickHere && affiliate.length > 5) reasons.push(`click-here + ${affiliate.length} affiliate links`);

  if (!reasons.length) return null;
  return { name: "spam", severity: 2, hits: reasons.length, samples: reasons };
}

function detectLowQuality(body: string): CategoryHit | null {
  const trimmed = body.trim();
  const wc = trimmed.split(/\s+/).filter(Boolean).length;
  const reasons: string[] = [];

  if (wc < 80) reasons.push(`word count ${wc} < 80`);

  const hasMultipleParas = /\n\s*\n/.test(trimmed);
  if (!hasMultipleParas && trimmed.length > 400) reasons.push("single paragraph wall");

  const nonAsciiCount = (trimmed.match(/[^\x00-\x7F]/g) ?? []).length;
  if (trimmed.length > 0 && nonAsciiCount / trimmed.length > 0.5) {
    reasons.push("> 50% non-ASCII");
  }

  if (/[A-Z]{11,}/.test(trimmed)) reasons.push("> 10 consecutive capitals");

  if (wc >= 20) {
    const freq = new Map<string, number>();
    for (const w of trimmed.toLowerCase().split(/\W+/).filter((s) => s.length > 3)) {
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
    const total = Array.from(freq.values()).reduce((a, b) => a + b, 0);
    if (total > 0) {
      const top = Math.max(...freq.values());
      if (top / total > 0.3) reasons.push(`keyword repetition ${Math.round((top / total) * 100)}%`);
    }
  }

  if (!reasons.length) return null;
  return { name: "low_quality", severity: 1, hits: reasons.length, samples: reasons };
}

type OpenAIModeration = {
  results?: Array<{
    flagged: boolean;
    categories: Record<string, boolean>;
  }>;
};

async function openAISignal(text: string): Promise<CategoryHit[]> {
  if (!env.OPENAI_API_KEY) return [];
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
    if (!res.ok) return [];
    const data = (await res.json()) as OpenAIModeration;
    const r = data.results?.[0];
    if (!r || !r.flagged) return [];
    const active = Object.entries(r.categories).filter(([, v]) => v).map(([k]) => k);
    const out: CategoryHit[] = [];
    for (const cat of active) {
      const severe = /sexual\/minors|illicit\/violent|self-harm/.test(cat);
      const mapped: CategoryName = /sexual\/minors/.test(cat)
        ? "sexual_minors"
        : /illicit\/violent|violence/.test(cat)
          ? "illegal_violence"
          : /self-harm/.test(cat)
            ? "self_harm"
            : /hate/.test(cat)
              ? "hate_speech"
              : "extremism";
      out.push({ name: mapped, severity: severe ? 3 : 2, hits: 1, samples: [`openai:${cat}`] });
    }
    return out;
  } catch (err) {
    log.warn("moderation.openai_error", { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

function mergeCategories(list: CategoryHit[]): CategoryHit[] {
  const byName = new Map<CategoryName, CategoryHit>();
  for (const c of list) {
    const prev = byName.get(c.name);
    if (!prev) {
      byName.set(c.name, { ...c, samples: [...c.samples] });
      continue;
    }
    prev.hits += c.hits;
    prev.severity = Math.max(prev.severity, c.severity) as 1 | 2 | 3;
    prev.samples = uniqueSamples([...prev.samples, ...c.samples]);
  }
  return Array.from(byName.values());
}

function decide(categories: CategoryHit[]): { status: ContentAnalysis["status"]; score: number } {
  let score = 0;
  let sev3 = 0;
  let sev2 = 0;
  let sev1 = 0;
  for (const c of categories) {
    score += c.severity * 10 + c.hits;
    if (c.severity === 3) sev3++;
    else if (c.severity === 2) sev2++;
    else sev1++;
  }
  let status: ContentAnalysis["status"] = "approved";
  if (sev3 >= 1 || sev2 >= 2) status = "rejected";
  else if (sev2 >= 1 || sev1 >= 1) status = "flagged";
  return { status, score };
}

export async function analyzeContent(title: string, body: string): Promise<ContentAnalysis> {
  const text = `${title}\n\n${body}`;
  const local = runRules(text);
  const spam = detectSpam(title, body);
  const lq = detectLowQuality(body);
  const ai = await openAISignal(text);
  const categories = mergeCategories([...local, ...(spam ? [spam] : []), ...(lq ? [lq] : []), ...ai]);
  const { status, score } = decide(categories);
  const notes = categories.length
    ? categories.map((c) => `${c.name}(s${c.severity}x${c.hits})`).join(", ")
    : null;
  if (status !== "approved") {
    log.warn("moderation.flagged", { status, categories: categories.map((c) => c.name), score });
  }
  return { status, categories, notes, score };
}

export async function moderateContent(title: string, body: string): Promise<ModerationResult> {
  const a = await analyzeContent(title, body);
  return { status: a.status, notes: a.notes };
}
