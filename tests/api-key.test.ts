import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { generateApiKey } from "@/lib/auth/api-key";

describe("generateApiKey", () => {
  it("produces a plain key with glg_live_ prefix", () => {
    const { plain } = generateApiKey();
    expect(plain.startsWith("glg_live_")).toBe(true);
  });

  it("returns a 16-char prefix that matches the start of the plain key", () => {
    const { plain, prefix } = generateApiKey();
    expect(prefix).toHaveLength(16);
    expect(plain.startsWith(prefix)).toBe(true);
    expect(prefix.startsWith("glg_live_")).toBe(true);
  });

  it("hash equals sha256(plain) in hex", () => {
    const { plain, hash } = generateApiKey();
    const expected = createHash("sha256").update(plain).digest("hex");
    expect(hash).toBe(expected);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces unique keys on each call", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.plain).not.toBe(b.plain);
    expect(a.hash).not.toBe(b.hash);
  });
});
