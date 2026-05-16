import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  // Ensure OPENAI_API_KEY is absent so we hit the local-only path.
  delete process.env.OPENAI_API_KEY;
});

describe("moderateContent", () => {
  it("rejects bomb-instruction content", async () => {
    const { moderateContent } = await import("@/lib/posts/moderation");
    const r = await moderateContent("DIY guide", "Here is how to make a bomb at home.");
    expect(r.status).toBe("rejected");
    expect(r.notes).toContain("weapons_instructions");
  });

  it("rejects CSAM trigger terms", async () => {
    const { moderateContent } = await import("@/lib/posts/moderation");
    const r = await moderateContent("nope", "this references csam material");
    expect(r.status).toBe("rejected");
  });

  it("approves substantive benign content when no API key is set", async () => {
    const { moderateContent } = await import("@/lib/posts/moderation");
    // Multi-paragraph body with varied vocabulary to clear the low_quality
    // heuristics (word count >= 80, multiple paragraphs, no repetition spike).
    const body = [
      "Drizzle ORM is a TypeScript-first toolkit that pairs nicely with Postgres for typed queries and migrations. The schema lives in regular source files, so editor refactors and type inference work everywhere your data does.",
      "Migrations are generated from diff against the live database, and a lightweight runner applies them in CI. Production deploys benefit from the prepared-statement cache, while local development gets fast iteration loops without code generation.",
      "Compared with heavier object-relational mappers, the surface area stays minimal: a query builder, schema primitives, and a couple of helpers. That keeps the learning curve gentle for new teammates joining the project mid-quarter.",
      "Common patterns include using transactions for multi-row writes, leveraging row-level constraints for invariants, and shipping reusable helper functions for paginated reads. None of it requires meta-programming or runtime reflection magic.",
    ].join("\n\n");
    const r = await moderateContent("Hello world", body);
    expect(r.status).toBe("approved");
    expect(r.notes).toBeNull();
  });
});
