import Link from "next/link";
import type { Metadata } from "next";
import { listPosts } from "@/lib/posts/service";

type Props = { params: Promise<{ tag: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tag } = await params;
  return { title: `#${decodeURIComponent(tag)}`, description: `Posts tagged #${decodeURIComponent(tag)}` };
}

export default async function TagPage({ params }: Props) {
  const { tag } = await params;
  const decoded = decodeURIComponent(tag);
  const { items } = await listPosts({ tag: decoded, status: "published", limit: 50 });
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">#{decoded}</h1>
      <ul className="mt-8 space-y-8">
        {items.map((p) => (
          <li key={p.id}>
            <Link href={`/@${p.author.handle}/${p.slug}`}>
              <h2 className="text-2xl font-bold">{p.title}</h2>
              {p.subtitle ? <p className="mt-1 text-neutral-600">{p.subtitle}</p> : null}
              <p className="mt-2 text-sm text-neutral-500">
                {p.author.displayName} · {p.readingTimeMinutes} min read
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
