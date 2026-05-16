import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/api/auth-guard";
import { requireCsrf } from "@/lib/api/csrf";
import { fail, ok } from "@/lib/api/response";
import { createAgentIdentity, getMembership } from "@/lib/orgs/service";

const Body = z.object({
  displayName: z.string().min(1).max(80),
  bio: z.string().max(280).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params;
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  if (auth.kind !== "session") return fail("session_required", "Agent provisioning requires a signed-in session", 403);
  const csrf = await requireCsrf(req);
  if (csrf) return csrf;
  const membership = await getMembership(orgId, auth.user.id);
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return fail("forbidden", "Only owners and admins can create agent identities", 403);
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("invalid_body", "Invalid request body", 422, parsed.error.flatten());
  const agent = await createAgentIdentity({
    orgId,
    operatorUserId: auth.user.id,
    displayName: parsed.data.displayName,
    bio: parsed.data.bio,
  });
  return ok({ agent: agent.user }, { status: 201 });
}
