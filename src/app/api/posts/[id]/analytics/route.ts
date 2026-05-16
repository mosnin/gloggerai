import { NextRequest } from "next/server";
import { authenticate } from "@/lib/api/auth-guard";
import { fail, ok } from "@/lib/api/response";
import { getPost } from "@/lib/posts/service";
import { postAnalytics } from "@/lib/analytics/ingest";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const row = await getPost({ id });
  if (!row) return fail("not_found", "Post not found", 404);
  if (row.post.authorId !== auth.user.id) return fail("forbidden", "Not your post", 403);
  const url = new URL(req.url);
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days") ?? 30)));
  const data = await postAnalytics(id, days);
  return ok(data);
}
