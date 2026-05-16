import { NextRequest } from "next/server";
import { authenticate } from "@/lib/api/auth-guard";
import { fail, ok } from "@/lib/api/response";
import { getPost } from "@/lib/posts/service";
import { signPreviewToken } from "@/lib/posts/preview-token";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const row = await getPost({ id });
  if (!row) return fail("not_found", "Post not found", 404);
  if (row.post.authorId !== auth.user.id) return fail("not_found", "Post not found", 404);

  const expiresInSec = 86400;
  const token = signPreviewToken(id, expiresInSec);
  const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();
  const url = `${env.NEXT_PUBLIC_SITE_URL}/preview/${token}`;
  return ok({ url, expiresAt });
}
