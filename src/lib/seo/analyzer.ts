/**
 * SEO score for an article. Pure function — no I/O. Agents call /api/seo/analyze
 * with title + contentMd + meta, get a 0-100 score plus a list of fixes.
 */

export type SeoIssue = {
  id: string;
  severity: "error" | "warning" | "info";
  message: string;
  /** What the agent should change. Concrete, actionable. */
  fix: string;
};

export type SeoReport = {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  issues: SeoIssue[];
  stats: {
    titleLength: number;
    seoTitleLength: number;
    descriptionLength: number;
    wordCount: number;
    readingTimeMinutes: number;
    headingCount: number;
    h2Count: number;
    h3Count: number;
    internalLinks: number;
    externalLinks: number;
    images: number;
    imagesWithoutAlt: number;
    keywordsInTitle: number;
    keywordDensityPct: number;
  };
};

export type SeoInput = {
  title: string;
  contentMd: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  excerpt?: string | null;
  tags?: string[];
  keywords?: string[];
  coverImageUrl?: string | null;
  canonicalUrl?: string | null;
};

const STOPWORDS = new Set([
  "a", "an", "and", "or", "but", "the", "is", "are", "was", "were", "of", "on", "in",
  "to", "for", "with", "from", "by", "at", "as", "it", "this", "that", "be", "if", "we",
]);

function gradeFor(score: number): SeoReport["grade"] {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 55) return "D";
  return "F";
}

function countMatches(re: RegExp, s: string): number {
  return s.match(re)?.length ?? 0;
}

function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/[*_~>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

export function analyzeSeo(input: SeoInput): SeoReport {
  const issues: SeoIssue[] = [];
  const md = input.contentMd ?? "";
  const text = plainText(md);
  const tokens = tokenize(text);
  const titleTokens = tokenize(input.title);

  // Headings
  const headings = [...md.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((m) => ({ level: m[1].length, text: m[2].trim() }));
  const h1 = headings.filter((h) => h.level === 1);
  const h2 = headings.filter((h) => h.level === 2);
  const h3 = headings.filter((h) => h.level === 3);

  // Images
  const images = [...md.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
  const imagesWithoutAlt = images.filter((m) => !m[1].trim()).length;

  // Links — ignore image syntax matches because `!` would precede `[`.
  const links = [...md.matchAll(/(?<!\!)\[([^\]]+)\]\(([^)]+)\)/g)];
  const externalLinks = links.filter((m) => /^https?:\/\//i.test(m[2])).length;
  const internalLinks = links.length - externalLinks;

  const wordCount = tokens.length;
  const readingTimeMinutes = Math.max(1, Math.round(wordCount / 200));
  const seoTitle = input.seoTitle ?? input.title;
  const description = input.seoDescription ?? input.excerpt ?? "";

  // Keyword analysis: primary keyword is keywords[0] || tags[0].
  const primary = (input.keywords?.[0] ?? input.tags?.[0] ?? "").toLowerCase();
  const primaryTokens = primary ? tokenize(primary) : [];
  const titleTokenSet = new Set(titleTokens);
  const keywordsInTitle = primaryTokens.filter((t) => titleTokenSet.has(t)).length;
  const primaryOccurrences = primary
    ? countMatches(new RegExp(`\\b${primary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), text)
    : 0;
  const keywordDensityPct = wordCount ? Math.round((primaryOccurrences / wordCount) * 10000) / 100 : 0;

  // --- Scoring ---
  let score = 100;

  // Title
  if (input.title.length < 25) {
    score -= 8;
    issues.push({
      id: "title_too_short",
      severity: "warning",
      message: `Title is ${input.title.length} chars — shorter than ideal.`,
      fix: "Expand the title to 40-65 characters. Lead with the primary keyword.",
    });
  }
  if (seoTitle.length > 65) {
    score -= 6;
    issues.push({
      id: "seo_title_too_long",
      severity: "warning",
      message: `seoTitle is ${seoTitle.length} chars — Google truncates around 60-65.`,
      fix: "Trim seoTitle to ≤ 65 characters while keeping the primary keyword early.",
    });
  }

  // Description
  if (!description) {
    score -= 12;
    issues.push({
      id: "description_missing",
      severity: "error",
      message: "No seoDescription / excerpt set.",
      fix: "Set seoDescription to 120-160 characters summarising the post and its value.",
    });
  } else if (description.length < 80) {
    score -= 6;
    issues.push({
      id: "description_too_short",
      severity: "warning",
      message: `Description is ${description.length} chars — under 80 wastes search-snippet space.`,
      fix: "Extend seoDescription to 120-160 characters with the primary keyword.",
    });
  } else if (description.length > 170) {
    score -= 4;
    issues.push({
      id: "description_too_long",
      severity: "info",
      message: `Description is ${description.length} chars — search engines truncate around 160.`,
      fix: "Tighten seoDescription to ≤ 160 characters.",
    });
  }

  // Headings
  if (h1.length > 0) {
    score -= 6;
    issues.push({
      id: "extra_h1",
      severity: "warning",
      message: `Found ${h1.length} H1(s) in body — the post title is already H1.`,
      fix: "Demote in-body H1s to H2 (## …).",
    });
  }
  if (h2.length === 0 && wordCount > 400) {
    score -= 10;
    issues.push({
      id: "no_h2",
      severity: "error",
      message: "Long-form post has no H2 sections.",
      fix: "Break the body into 3-6 H2 sections that match likely search intents.",
    });
  }

  // Length
  if (wordCount < 300) {
    score -= 15;
    issues.push({
      id: "thin_content",
      severity: "error",
      message: `Only ${wordCount} words — thin content under-ranks.`,
      fix: "Expand to 600-1500 words with concrete examples, data, and links.",
    });
  } else if (wordCount > 3500) {
    score -= 3;
    issues.push({
      id: "very_long",
      severity: "info",
      message: `${wordCount} words — consider splitting into a series.`,
      fix: "Articles over 3500 words risk lower completion. Split or add a TL;DR.",
    });
  }

  // Images
  if (images.length === 0 && wordCount > 600) {
    score -= 4;
    issues.push({
      id: "no_images",
      severity: "info",
      message: "No inline images on a long-form post.",
      fix: "Add at least one image, diagram, or chart with descriptive alt text.",
    });
  }
  if (imagesWithoutAlt > 0) {
    score -= 6;
    issues.push({
      id: "missing_alt_text",
      severity: "warning",
      message: `${imagesWithoutAlt} image(s) missing alt text.`,
      fix: "Add alt text to every image (it boosts accessibility and image SEO).",
    });
  }

  // Cover image
  if (!input.coverImageUrl) {
    score -= 3;
    issues.push({
      id: "no_cover_image",
      severity: "info",
      message: "No cover image set.",
      fix: "Set coverImageUrl — it powers Open Graph previews and social CTR.",
    });
  }

  // Links
  if (externalLinks === 0 && wordCount > 400) {
    score -= 4;
    issues.push({
      id: "no_outbound_links",
      severity: "info",
      message: "No outbound citations.",
      fix: "Link to 1-3 authoritative sources to support claims.",
    });
  }

  // Keywords
  if (!primary) {
    score -= 6;
    issues.push({
      id: "no_primary_keyword",
      severity: "warning",
      message: "No keywords or tags set.",
      fix: "Set at least one keyword or tag representing the primary topic.",
    });
  } else if (keywordsInTitle === 0) {
    score -= 8;
    issues.push({
      id: "keyword_not_in_title",
      severity: "warning",
      message: `Primary keyword \"${primary}\" doesn't appear in the title.`,
      fix: "Rewrite the title so the primary keyword appears in the first half.",
    });
  }
  if (primary && primaryOccurrences === 0) {
    score -= 8;
    issues.push({
      id: "keyword_missing_from_body",
      severity: "warning",
      message: `Primary keyword \"${primary}\" never appears in the body.`,
      fix: "Use the primary keyword naturally 3-8 times in the body.",
    });
  } else if (keywordDensityPct > 3.5) {
    score -= 5;
    issues.push({
      id: "keyword_stuffing",
      severity: "warning",
      message: `Keyword density is ${keywordDensityPct}% — looks like stuffing.`,
      fix: "Reduce repetition of the primary keyword to ≤ 3% density.",
    });
  }

  // Tags
  if (!input.tags || input.tags.length === 0) {
    score -= 3;
    issues.push({
      id: "no_tags",
      severity: "info",
      message: "Post has no tags.",
      fix: "Add 2-5 tags so the post surfaces in topic pages and related posts.",
    });
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    grade: gradeFor(score),
    issues,
    stats: {
      titleLength: input.title.length,
      seoTitleLength: seoTitle.length,
      descriptionLength: description.length,
      wordCount,
      readingTimeMinutes,
      headingCount: headings.length,
      h2Count: h2.length,
      h3Count: h3.length,
      internalLinks,
      externalLinks,
      images: images.length,
      imagesWithoutAlt,
      keywordsInTitle,
      keywordDensityPct,
    },
  };
}
