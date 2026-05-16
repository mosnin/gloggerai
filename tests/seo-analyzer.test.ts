import { describe, it, expect } from "vitest";
import { analyzeSeo } from "@/lib/seo/analyzer";

const longBody = (wordCount: number, keyword = "drizzle"): string => {
  const filler = `Postgres is great for content. We compare patterns and discuss tradeoffs. ${keyword} helps with type safety. `;
  const words = filler.repeat(Math.ceil(wordCount / 12)).split(/\s+/).slice(0, wordCount);
  return words.join(" ");
};

describe("analyzeSeo", () => {
  it("returns thin_content + low score for empty body", () => {
    const report = analyzeSeo({ title: "Hello world post about Drizzle ORM", contentMd: "" });
    expect(report.issues.some((i) => i.id === "thin_content")).toBe(true);
    expect(report.score).toBeLessThan(70);
    expect(report.stats.wordCount).toBe(0);
  });

  it("flags missing description", () => {
    const report = analyzeSeo({
      title: "A reasonably long post title about drizzle orm",
      contentMd: longBody(800),
    });
    expect(report.issues.some((i) => i.id === "description_missing")).toBe(true);
  });

  it("flags long seoTitle (>65 chars)", () => {
    const longSeoTitle = "x".repeat(90);
    const report = analyzeSeo({
      title: "Normal title about drizzle orm patterns",
      contentMd: longBody(800),
      seoTitle: longSeoTitle,
    });
    expect(report.issues.some((i) => i.id === "seo_title_too_long")).toBe(true);
  });

  it("primary keyword present in title scores higher than absent", () => {
    const base = {
      contentMd: longBody(800, "drizzle"),
      seoDescription: "A useful post about Drizzle ORM and how to model schemas in TypeScript with sensible defaults today.",
      keywords: ["drizzle"],
      coverImageUrl: "https://example.com/cover.jpg",
      tags: ["orm"],
    };
    const withKw = analyzeSeo({ ...base, title: "Drizzle ORM patterns for modern apps" });
    const withoutKw = analyzeSeo({ ...base, title: "ORM patterns for modern apps today" });
    expect(withKw.score).toBeGreaterThan(withoutKw.score);
    expect(withoutKw.issues.some((i) => i.id === "keyword_not_in_title")).toBe(true);
  });

  it("flags keyword stuffing when density > 3.5%", () => {
    // 100 words, 10 occurrences => 10% density.
    const stuffed = ("drizzle " + "filler ".repeat(9)).repeat(10).trim();
    const report = analyzeSeo({
      title: "Drizzle ORM techniques",
      contentMd: stuffed,
      keywords: ["drizzle"],
      seoDescription: "Drizzle ORM techniques summary describing how we use it in production for type-safe queries.",
    });
    expect(report.issues.some((i) => i.id === "keyword_stuffing")).toBe(true);
  });

  it("flags images missing alt text", () => {
    const body =
      longBody(700) +
      "\n\n![](https://example.com/a.jpg)\n\n![](https://example.com/b.jpg)\n";
    const report = analyzeSeo({
      title: "Post with images about drizzle",
      contentMd: body,
      seoDescription: "Description that is long enough to satisfy the analyzer's minimum length requirement for tests here.",
    });
    expect(report.issues.some((i) => i.id === "missing_alt_text")).toBe(true);
    expect(report.stats.imagesWithoutAlt).toBe(2);
  });

  it("flags multiple H1s in body", () => {
    const body = "# First heading\n\nSome content here.\n\n# Second heading\n\n" + longBody(700);
    const report = analyzeSeo({
      title: "Post about drizzle with extra h1",
      contentMd: body,
      seoDescription: "A description that is long enough to satisfy the analyzer's minimum length requirement for our test.",
    });
    expect(report.issues.some((i) => i.id === "extra_h1")).toBe(true);
  });

  it("happy-path 1000-word post with all metadata scores >= 85", () => {
    const sections = Array.from({ length: 5 }, (_, i) => `## Section ${i + 1}\n\n${longBody(180, "drizzle")}\n`).join("\n");
    const body =
      sections +
      "\n\nSee the [docs](https://orm.drizzle.team) for more.\n\n" +
      "![Schema diagram](https://example.com/schema.png)\n";
    const report = analyzeSeo({
      title: "Drizzle ORM patterns for modern Postgres apps",
      contentMd: body,
      seoTitle: "Drizzle ORM patterns for modern Postgres apps",
      seoDescription:
        "An in-depth guide to Drizzle ORM patterns: schema design, migrations, query composition, and testing strategies for Postgres in 2025.",
      keywords: ["drizzle"],
      tags: ["drizzle", "postgres", "orm"],
      coverImageUrl: "https://example.com/cover.jpg",
    });
    expect(report.score).toBeGreaterThanOrEqual(85);
    expect(report.grade === "A" || report.grade === "B").toBe(true);
  });
});
