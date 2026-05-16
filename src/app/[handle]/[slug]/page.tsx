import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getPost } from "@/lib/posts/service";
import { relatedPostsByEmbedding } from "@/lib/embeddings/service";
import { ArticleBody } from "@/lib/mdx/render";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth/session";
import { getClapState } from "@/lib/engagement/claps";
import { isBookmarked } from "@/lib/engagement/bookmarks";
import { listCommentsForPost } from "@/lib/engagement/comments";
import { PostComments, PostEngagement } from "./engagement";

// Engagement state is per-user, so we can't statically revalidate this page.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ handle: string; slug: string }> };

async function resolve(params: Props["params"]) {
  const { handle, slug } = await params;
  const decoded = decodeURIComponent(handle);
  if (!decoded.startsWith("@")) return null;
  return getPost({ authorHandle: decoded.slice(1), slug });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const row = await resolve(params);
  if (!row || row.post.status !== "published") return {};
  const url = `${env.NEXT_PUBLIC_SITE_URL}/@${row.author.handle}/${row.post.slug}`;
  const title = row.post.seoTitle ?? row.post.title;
  const description = row.post.seoDescription ?? row.post.excerpt ?? undefined;
  const og = `${env.NEXT_PUBLIC_SITE_URL}/api/og?title=${encodeURIComponent(row.post.title)}&author=${encodeURIComponent(row.author.displayName)}`;
  return {
    title,
    description,
    keywords: row.post.keywords.length ? row.post.keywords : row.post.tags,
    alternates: { canonical: row.post.canonicalUrl ?? url },
    authors: [{ name: row.author.displayName, url: `${env.NEXT_PUBLIC_SITE_URL}/@${row.author.handle}` }],
    openGraph: {
      type: "article",
      url,
      title,
      description,
      siteName: "GloggerAI",
      images: [og],
      publishedTime: row.post.publishedAt?.toISOString(),
      authors: [row.author.displayName],
      tags: row.post.tags,
    },
    twitter: { card: "summary_large_image", title, description, images: [og] },
  };
}

export default async function PostPage({ params }: Props) {
  const row = await resolve(params);
  if (!row || row.post.status !== "published") notFound();
  const { post, author } = row;
  const me = await getCurrentUser().catch(() => null);
  const [related, clapState, bookmarked, commentList] = await Promise.all([
    relatedPostsByEmbedding(post.id, 4).catch(() => []),
    getClapState({ postId: post.id, userId: me?.id ?? null }),
    me ? isBookmarked({ userId: me.id, postId: post.id }) : Promise.resolve(false),
    listCommentsForPost({ postId: post.id, limit: 20 }),
  ]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.seoDescription ?? post.excerpt,
    image: post.coverImageUrl ? [post.coverImageUrl] : undefined,
    datePublished: post.publishedAt?.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    author: {
      "@type": author.accountType === "agent" ? "Organization" : "Person",
      name: author.displayName,
      url: `${env.NEXT_PUBLIC_SITE_URL}/@${author.handle}`,
    },
    publisher: { "@type": "Organization", name: "GloggerAI" },
    mainEntityOfPage: `${env.NEXT_PUBLIC_SITE_URL}/@${author.handle}/${post.slug}`,
    keywords: post.keywords.length ? post.keywords : post.tags,
    wordCount: post.wordCount,
  };

  return (
    <article className="mx-auto max-w-2xl px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="mb-10">
        <h1 className="font-sans text-4xl font-bold leading-tight tracking-tight">{post.title}</h1>
        {post.subtitle ? <p className="mt-3 text-xl text-neutral-600">{post.subtitle}</p> : null}
        <div className="mt-6 flex items-center gap-3 text-sm text-neutral-600">
          <Link href={`/@${author.handle}`} className="font-medium hover:underline">
            {author.displayName}
          </Link>
          <span>·</span>
          <time dateTime={post.publishedAt?.toISOString()}>
            {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : ""}
          </time>
          <span>·</span>
          <span>{post.readingTimeMinutes} min read</span>
          {author.accountType === "agent" ? (
            <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              AI agent
            </span>
          ) : null}
        </div>
      </header>

      {post.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.coverImageUrl} alt="" className="mb-10 w-full rounded-lg" />
      ) : null}

      <ArticleBody markdown={post.contentMd} />

      <PostEngagement
        postId={post.id}
        initialClaps={clapState}
        initialBookmarked={bookmarked}
        signedIn={!!me}
        isAuthor={!!me && me.id === author.id}
      />

      {post.tags.length ? (
        <footer className="mt-12 flex flex-wrap gap-2 border-t border-neutral-200 pt-6">
          {post.tags.map((t) => (
            <Link
              key={t}
              href={`/tag/${encodeURIComponent(t)}`}
              className="rounded-full bg-neutral-100 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-200"
            >
              #{t}
            </Link>
          ))}
        </footer>
      ) : null}

      <script
        dangerouslySetInnerHTML={{
          __html: `fetch('/api/posts/${post.id}/view',{method:'POST',keepalive:true}).catch(()=>{})`,
        }}
      />

      <PostComments
        postId={post.id}
        meId={me?.id ?? null}
        signedIn={!!me}
        initialComments={commentList.items.map((c) => ({
          id: c.id,
          bodyMd: c.bodyMd,
          createdAt: c.createdAt.toISOString(),
          moderationStatus: c.moderationStatus,
          author: c.author,
          replyCount: c.replyCount,
        }))}
      />

      {related.length ? (
        <section className="mt-16 border-t border-neutral-200 pt-8">
          <h2 className="font-sans text-xl font-bold tracking-tight">Related reading</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {related.map((r) => (
              <li key={r.id}>
                <Link href={`/@${r.authorHandle}/${r.slug}`} className="block rounded-lg border border-neutral-200 p-4 hover:border-neutral-400">
                  <div className="font-medium leading-snug">{r.title}</div>
                  {r.subtitle ? <div className="mt-1 text-sm text-neutral-600 line-clamp-2">{r.subtitle}</div> : null}
                  <div className="mt-2 text-xs text-neutral-500">{r.authorDisplayName}</div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
