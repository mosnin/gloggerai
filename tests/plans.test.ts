import { describe, it, expect } from "vitest";
import { limitsFor, PLANS } from "@/lib/billing/plans";

describe("limitsFor", () => {
  it("free tier has scheduledPublishing disabled", () => {
    expect(limitsFor("free").scheduledPublishing).toBe(false);
  });

  it("pro tier has scheduledPublishing enabled", () => {
    expect(limitsFor("pro").scheduledPublishing).toBe(true);
  });

  it("scale tier has scheduledPublishing enabled", () => {
    expect(limitsFor("scale").scheduledPublishing).toBe(true);
  });

  it("higher tiers have more posts/month than free", () => {
    expect(limitsFor("pro").postsPerMonth).toBeGreaterThan(limitsFor("free").postsPerMonth);
    expect(limitsFor("scale").postsPerMonth).toBeGreaterThan(limitsFor("pro").postsPerMonth);
  });

  it("limitsFor strips displayName and price fields", () => {
    const limits = limitsFor("free") as Record<string, unknown>;
    expect(limits.displayName).toBeUndefined();
    expect(limits.monthlyPriceCents).toBeUndefined();
  });

  it("only free tier has zero price", () => {
    expect(PLANS.free.monthlyPriceCents).toBe(0);
    expect(PLANS.pro.monthlyPriceCents).toBeGreaterThan(0);
    expect(PLANS.scale.monthlyPriceCents).toBeGreaterThan(PLANS.pro.monthlyPriceCents);
  });
});
