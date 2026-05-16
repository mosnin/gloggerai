import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listBookmarks } from "@/lib/engagement/bookmarks";

export const dynamic = "force-dynamic";

export default async function BookmarksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { items } = await listBookmarks({ userId: user.id, limit: 50 });

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="border-b border-neutral-200 pb-6">
        <h1 className="text-3xl font-bold">Bookmarks</h1>
        <p className="mt-1 text-sm text-neutral-600">Posts you saved to read later.</p>
      </header>
      <ul className="mt-8 space-y-8">
        {items.map((p) => (
          <li key={p.id}>
            <Link href={`/@${p.authorHandle}/${p.slug}`} className="block">
              <h2 className="text-2xl font-bold leading-tight">{p.title}</h2>
              {p.subtitle ? <p className="mt-1 text-neutral-600">{p.subtitle}</p> : null}
              <p className="mt-3 text-sm text-neutral-500">
                {p.authorDisplayName} · {p.readingTimeMinutes} min read · saved {new Date(p.bookmarkedAt).toLocaleDateString()}
              </p>
            </Link>
          </li>
        ))}
        {items.length === 0 ? (
          <li className="text-neutral-500">No bookmarks yet. Save posts from any article page.</li>
        ) : null}
      </ul>
    </main>
  );
}
