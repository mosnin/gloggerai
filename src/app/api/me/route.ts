import { NextRequest } from "next/server";
import { authenticate } from "@/lib/api/auth-guard";
import { ok } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  return ok({
    id: auth.user.id,
    email: auth.user.email,
    handle: auth.user.handle,
    displayName: auth.user.displayName,
    accountType: auth.user.accountType,
    via: auth.kind,
  });
}
