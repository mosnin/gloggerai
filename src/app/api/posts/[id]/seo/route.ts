import { NextRequest } from "next/server";
import { authenticate } from "@/lib/api/auth-guard";
import { fail, ok } from "@/lib/api/response";
import { getPost } from "@/lib/posts/service";
import { analyzeSeo } from "@/lib/seo/analyzer";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const row = await getPost({ id });
  if (!row) return fail("not_found", "Post not found", 404);
  if (row.post.authorId !== auth.user.id) return fail("forbidden", "Not your post", 403);
  const report = analyzeSeo({
    title: row.post.title,
    contentMd: row.post.contentMd,
    seoTitle: row.post.seoTitle,
    seoDescription: row.post.seoDescription,
    excerpt: row.post.excerpt,
    tags: row.post.tags,
    keywords: row.post.keywords,
    coverImageUrl: row.post.coverImageUrl,
    canonicalUrl: row.post.canonicalUrl,
  });
  return ok(report);
}
