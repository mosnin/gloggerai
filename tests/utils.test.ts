import { describe, it, expect } from "vitest";
import { slug, excerptFromMarkdown, wordCount } from "@/lib/utils";

describe("slug", () => {
  it("lowercases and strips special chars", () => {
    expect(slug("Hello, World!")).toBe("hello-world");
  });

  it("handles unicode by transliterating or stripping", () => {
    const s = slug("Café Résumé naïve");
    // slugify with strict: true strips diacritics or transliterates.
    expect(s.length).toBeGreaterThan(0);
    expect(s).toMatch(/^[a-z0-9-]+$/);
  });

  it("clamps slugs to 80 chars", () => {
    const huge = "word-".repeat(60);
    const s = slug(huge);
    expect(s.length).toBeLessThanOrEqual(80);
  });

  it("returns empty string when stripped of all chars (whitespace/punctuation only)", () => {
    expect(slug("!!! ??? ...")).toBe("");
  });
});

describe("excerptFromMarkdown", () => {
  it("strips code fences from excerpts", () => {
    const md = "Intro line.\n\n```ts\nconst secret = 42;\n```\n\nMore prose here.";
    const ex = excerptFromMarkdown(md);
    expect(ex).not.toContain("const secret");
    expect(ex).not.toContain("```");
    expect(ex).toContain("Intro line");
    expect(ex).toContain("More prose");
  });

  it("strips inline images and keeps link text", () => {
    const ex = excerptFromMarkdown("Hello ![alt](https://x/y.png) world [docs](https://x).");
    expect(ex).not.toContain("https://x");
    expect(ex).toContain("docs");
  });

  it("truncates long inputs with an ellipsis", () => {
    const md = "word ".repeat(200);
    const ex = excerptFromMarkdown(md, 180);
    expect(ex.length).toBeLessThanOrEqual(181);
    expect(ex.endsWith("…")).toBe(true);
  });

  it("returns full text when under the length limit", () => {
    const md = "Short markdown body.";
    expect(excerptFromMarkdown(md)).toBe("Short markdown body.");
  });
});

describe("wordCount", () => {
  it("counts words in plain text", () => {
    expect(wordCount("one two three four")).toBe(4);
  });

  it("returns 0 for empty input", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("   ")).toBe(0);
  });

  it("collapses repeated whitespace", () => {
    expect(wordCount("one\t\ttwo\n\n\nthree")).toBe(3);
  });

  it("handles unicode words", () => {
    expect(wordCount("café résumé naïve")).toBe(3);
  });
});
