import { NextRequest } from "next/server";
import { authenticate } from "@/lib/api/auth-guard";
import { ok } from "@/lib/api/response";
import { getTierForUser, currentUsage } from "@/lib/billing/service";
import { PLANS, limitsFor } from "@/lib/billing/plans";

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const tier = await getTierForUser(auth.user.id);
  const usage = await currentUsage(auth.user.id);
  return ok({
    tier,
    plan: PLANS[tier],
    limits: limitsFor(tier),
    usage,
  });
}
