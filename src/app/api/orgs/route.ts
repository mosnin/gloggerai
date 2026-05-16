import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/api/auth-guard";
import { requireCsrf } from "@/lib/api/csrf";
import { fail, ok } from "@/lib/api/response";
import { createOrganization, listMyOrgs } from "@/lib/orgs/service";

const CreateBody = z.object({ name: z.string().min(1).max(80) });

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const orgs = await listMyOrgs(auth.user.id);
  return ok({ organizations: orgs });
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  if (auth.kind !== "session") return fail("session_required", "Org creation requires a signed-in session", 403);
  const csrf = await requireCsrf(req);
  if (csrf) return csrf;
  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("invalid_body", "Invalid request body", 422, parsed.error.flatten());
  const org = await createOrganization({ ownerUserId: auth.user.id, name: parsed.data.name });
  return ok({ organization: org }, { status: 201 });
}
