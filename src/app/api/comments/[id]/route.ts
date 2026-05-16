import { NextRequest } from "next/server";
import { authenticate } from "@/lib/api/auth-guard";
import { fail, ok } from "@/lib/api/response";
import { deleteComment } from "@/lib/engagement/comments";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const removed = await deleteComment({ id, userId: auth.user.id });
  if (!removed) return fail("not_found", "Comment not found", 404);
  return ok({ ok: true, id });
}
