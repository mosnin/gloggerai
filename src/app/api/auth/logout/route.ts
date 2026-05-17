import type { NextRequest } from "next/server";
import { destroySession } from "@/lib/auth/session";
import { requireCsrf } from "@/lib/api/csrf";
import { ok } from "@/lib/api/response";

export async function POST(req: NextRequest) {
  const csrf = await requireCsrf(req);
  if (csrf) return csrf;
  await destroySession();
  return ok({ ok: true });
}
