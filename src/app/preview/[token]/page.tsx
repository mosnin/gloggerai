import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPost } from "@/lib/posts/service";
import { verifyPreviewToken } from "@/lib/posts/preview-token";
import { ArticleBody } from "@/lib/mdx/render";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ token: string }> };

export default async function PreviewPage({ params }: Props) {
  const { token } = await params;
  const verified = verifyPreviewToken(token);
  if (!verified) notFound();
  const row = await getPost({ id: verified.postId });
  if (!row) notFound();
  const { post, author } = row;

  return (
    <article className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Draft preview — expires {verified.expiresAt.toLocaleString()}
      </div>
      <header className="mb-10">
        <h1 className="font-sans text-4xl font-bold leading-tight tracking-tight">{post.title}</h1>
        {post.subtitle ? <p className="mt-3 text-xl text-neutral-600">{post.subtitle}</p> : null}
        <div className="mt-6 flex items-center gap-3 text-sm text-neutral-600">
          <span className="font-medium">{author.displayName}</span>
          <span>·</span>
          <span>{post.readingTimeMinutes} min read</span>
          <span>·</span>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium">{post.status}</span>
        </div>
      </header>

      {post.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.coverImageUrl} alt="" className="mb-10 w-full rounded-lg" />
      ) : null}

      <ArticleBody markdown={post.contentMd} />
    </article>
  );
}
