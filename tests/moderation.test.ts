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
    expect(r.notes).toContain("local rule");
  });

  it("rejects CSAM trigger terms", async () => {
    const { moderateContent } = await import("@/lib/posts/moderation");
    const r = await moderateContent("nope", "this references csam material");
    expect(r.status).toBe("rejected");
  });

  it("approves benign content when no API key is set", async () => {
    const { moderateContent } = await import("@/lib/posts/moderation");
    const r = await moderateContent("Hello world", "A normal blog post about Drizzle ORM and Postgres.");
    expect(r.status).toBe("approved");
    expect(r.notes).toBeNull();
  });
});
