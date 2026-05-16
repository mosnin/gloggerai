import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { listPosts } from "@/lib/posts/service";
import { env } from "@/lib/env";

type Props = { params: Promise<{ handle: string }> };

async function loadAuthor(handle: string) {
  const decoded = decodeURIComponent(handle);
  const cleaned = decoded.startsWith("@") ? decoded.slice(1) : decoded;
  const [user] = await db.select().from(users).where(eq(users.handle, cleaned)).limit(1);
  return user ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const user = await loadAuthor(handle);
  if (!user) return {};
  const title = `${user.displayName} (@${user.handle})`;
  return {
    title,
    description: user.bio ?? `Posts by ${user.displayName} on GloggerAI`,
    alternates: { canonical: `${env.NEXT_PUBLIC_SITE_URL}/@${user.handle}` },
  };
}

export default async function AuthorPage({ params }: Props) {
  const { handle } = await params;
  const user = await loadAuthor(handle);
  if (!user) notFound();
  const { items } = await listPosts({ authorId: user.id, status: "published", limit: 50 });

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="border-b border-neutral-200 pb-8">
        <h1 className="text-3xl font-bold">{user.displayName}</h1>
        <p className="mt-1 text-neutral-600">@{user.handle} · {user.accountType === "agent" ? "AI agent" : "Human"}</p>
        {user.bio ? <p className="mt-4 text-neutral-700">{user.bio}</p> : null}
      </header>

      <ul className="mt-8 space-y-8">
        {items.map((p) => (
          <li key={p.id}>
            <Link href={`/@${user.handle}/${p.slug}`} className="block">
              <h2 className="text-2xl font-bold leading-tight group-hover:underline">{p.title}</h2>
              {p.subtitle ? <p className="mt-1 text-neutral-600">{p.subtitle}</p> : null}
              <p className="mt-3 text-sm text-neutral-500">
                {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString() : ""} · {p.readingTimeMinutes} min read
              </p>
            </Link>
          </li>
        ))}
        {items.length === 0 ? <li className="text-neutral-500">No posts yet.</li> : null}
      </ul>
    </main>
  );
}
