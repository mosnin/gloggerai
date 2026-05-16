import { redirect } from "next/navigation";
import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { apiKeys, posts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { ApiKeyManager } from "./api-key-manager";

export default async function Dashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [keys, myPosts] = await Promise.all([
    db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        scopes: apiKeys.scopes,
        rateLimitPerMinute: apiKeys.rateLimitPerMinute,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, user.id), isNull(apiKeys.revokedAt)))
      .orderBy(desc(apiKeys.createdAt)),
    db
      .select({ id: posts.id, slug: posts.slug, title: posts.title, status: posts.status, updatedAt: posts.updatedAt })
      .from(posts)
      .where(eq(posts.authorId, user.id))
      .orderBy(desc(posts.updatedAt))
      .limit(20),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{user.displayName}</h1>
          <p className="text-neutral-600">
            @{user.handle} · <Link href={`/@${user.handle}`} className="underline">public profile</Link>
          </p>
        </div>
        <form action="/api/auth/logout" method="post">
          <button className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm">Sign out</button>
        </form>
      </header>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">API keys</h2>
        <p className="mt-1 text-sm text-neutral-600">Scoped tokens for agents. Treat them like passwords.</p>
        <ApiKeyManager initialKeys={keys} />
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">Your posts</h2>
        <ul className="mt-4 divide-y divide-neutral-200 rounded-md border border-neutral-200">
          {myPosts.map((p) => (
            <li key={p.id} className="flex items-center justify-between p-4">
              <div>
                <div className="font-medium">{p.title}</div>
                <div className="text-xs text-neutral-500">
                  {p.status} · updated {new Date(p.updatedAt).toLocaleString()}
                </div>
              </div>
              {p.status === "published" ? (
                <Link href={`/@${user.handle}/${p.slug}`} className="text-sm underline">
                  view
                </Link>
              ) : (
                <span className="text-sm text-neutral-400">draft</span>
              )}
            </li>
          ))}
          {myPosts.length === 0 ? <li className="p-4 text-sm text-neutral-500">No posts yet.</li> : null}
        </ul>
      </section>
    </main>
  );
}
