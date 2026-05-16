import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-session-secret-at-least-32-chars-xx";
  process.env.DATABASE_URL = "postgres://x:x@localhost:5432/x";
});

describe("preview token", () => {
  it("round-trips post id through sign/verify", async () => {
    const { signPreviewToken, verifyPreviewToken } = await import("@/lib/posts/preview-token");
    const id = "00000000-0000-0000-0000-000000000001";
    const token = signPreviewToken(id, 60);
    const out = verifyPreviewToken(token);
    expect(out?.postId).toBe(id);
  });

  it("rejects a tampered token", async () => {
    const { signPreviewToken, verifyPreviewToken } = await import("@/lib/posts/preview-token");
    const token = signPreviewToken("00000000-0000-0000-0000-000000000001", 60);
    const tampered = token.replace(/.$/, (c) => (c === "a" ? "b" : "a"));
    expect(verifyPreviewToken(tampered)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const { signPreviewToken, verifyPreviewToken } = await import("@/lib/posts/preview-token");
    const token = signPreviewToken("00000000-0000-0000-0000-000000000001", -1);
    expect(verifyPreviewToken(token)).toBeNull();
  });

  it("returns null on garbage input", async () => {
    const { verifyPreviewToken } = await import("@/lib/posts/preview-token");
    expect(verifyPreviewToken("not.a.token")).toBeNull();
    expect(verifyPreviewToken("")).toBeNull();
  });
});
