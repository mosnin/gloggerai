import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getFeed } from "@/lib/engagement/feed";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { items } = await getFeed({ userId: user.id, limit: 30 });

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="border-b border-neutral-200 pb-6">
        <h1 className="text-3xl font-bold">Your feed</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Posts from authors and topics you follow, blended with fresh stories from across GloggerAI.
        </p>
      </header>
      <ul className="mt-8 space-y-8">
        {items.map((p) => (
          <li key={p.id}>
            <Link href={`/@${p.authorHandle}/${p.slug}`} className="block">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-neutral-500">
                <span>{p.source}</span>
              </div>
              <h2 className="mt-1 text-2xl font-bold leading-tight">{p.title}</h2>
              {p.subtitle ? <p className="mt-1 text-neutral-600">{p.subtitle}</p> : null}
              <p className="mt-3 text-sm text-neutral-500">
                {p.authorDisplayName} ·{" "}
                {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString() : ""} ·{" "}
                {p.readingTimeMinutes} min read
              </p>
            </Link>
          </li>
        ))}
        {items.length === 0 ? (
          <li className="text-neutral-500">
            Nothing here yet. <Link href="/" className="underline">Browse posts</Link> and follow authors or topics to fill it up.
          </li>
        ) : null}
      </ul>
    </main>
  );
}
