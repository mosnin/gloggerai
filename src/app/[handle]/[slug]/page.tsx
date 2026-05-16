import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getPost, incrementViewCount } from "@/lib/posts/service";
import { ArticleBody } from "@/lib/mdx/render";
import { env } from "@/lib/env";

export const revalidate = 60;

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
  void incrementViewCount(post.id);

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
    </article>
  );
}
