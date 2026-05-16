import { NextRequest } from "next/server";
import { authenticate } from "@/lib/api/auth-guard";
import { ok } from "@/lib/api/response";
import { removeBookmark } from "@/lib/engagement/bookmarks";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  await removeBookmark({ userId: auth.user.id, postId });
  return ok({ ok: true });
}
