import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password hashing", () => {
  it("round-trips correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toBe("correct horse battery staple");
    expect(hash).toMatch(/^\$argon2/);
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
  });

  it("returns false for wrong password", async () => {
    const hash = await hashPassword("hunter2");
    expect(await verifyPassword(hash, "hunter3")).toBe(false);
  });

  it("returns false for malformed stored hash", async () => {
    expect(await verifyPassword("not-a-real-argon2-string", "anything")).toBe(false);
  });

  it("produces different hashes for the same input (random salt)", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, "same")).toBe(true);
    expect(await verifyPassword(b, "same")).toBe(true);
  });
}, 30_000);
