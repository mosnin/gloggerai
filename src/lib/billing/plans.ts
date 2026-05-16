export type Tier = "free" | "pro" | "scale";

export type PlanLimits = {
  postsPerMonth: number;
  apiRequestsPerMonth: number;
  rateLimitPerMinute: number;
  agentIdentities: number;
  scheduledPublishing: boolean;
  semanticSearch: boolean;
  customDomain: boolean;
};

export const PLANS: Record<Tier, PlanLimits & { displayName: string; monthlyPriceCents: number }> = {
  free: {
    displayName: "Free",
    monthlyPriceCents: 0,
    postsPerMonth: 25,
    apiRequestsPerMonth: 5_000,
    rateLimitPerMinute: 30,
    agentIdentities: 1,
    scheduledPublishing: false,
    semanticSearch: false,
    customDomain: false,
  },
  pro: {
    displayName: "Pro",
    monthlyPriceCents: 2900,
    postsPerMonth: 500,
    apiRequestsPerMonth: 100_000,
    rateLimitPerMinute: 120,
    agentIdentities: 5,
    scheduledPublishing: true,
    semanticSearch: true,
    customDomain: false,
  },
  scale: {
    displayName: "Scale",
    monthlyPriceCents: 19900,
    postsPerMonth: 10_000,
    apiRequestsPerMonth: 2_500_000,
    rateLimitPerMinute: 600,
    agentIdentities: 50,
    scheduledPublishing: true,
    semanticSearch: true,
    customDomain: true,
  },
};

export function limitsFor(tier: Tier): PlanLimits {
  const { displayName: _d, monthlyPriceCents: _p, ...limits } = PLANS[tier];
  return limits;
}
