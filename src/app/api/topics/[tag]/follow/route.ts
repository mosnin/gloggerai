import { NextRequest } from "next/server";
import { authenticate } from "@/lib/api/auth-guard";
import { ok } from "@/lib/api/response";
import { followTopic, unfollowTopic } from "@/lib/engagement/follows";

export async function POST(req: NextRequest, { params }: { params: Promise<{ tag: string }> }) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { tag } = await params;
  await followTopic({ userId: auth.user.id, tag: decodeURIComponent(tag) });
  return ok({ ok: true }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ tag: string }> }) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { tag } = await params;
  await unfollowTopic({ userId: auth.user.id, tag: decodeURIComponent(tag) });
  return ok({ ok: true });
}
