import { redirect } from "next/navigation";
import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { apiKeys, posts } from "@/db/schema";
import { oauthClients } from "@/db/schemas/oauth";
import { getCurrentUser } from "@/lib/auth/session";
import { unreadCount, listNotifications } from "@/lib/engagement/notifications";
import { ApiKeyManager } from "./api-key-manager";
import { OAuthApps } from "./oauth-apps";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [keys, myPosts, oauthApps, unread, recentNotifications] = await Promise.all([
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
    db
      .select({
        id: oauthClients.id,
        clientId: oauthClients.clientId,
        name: oauthClients.name,
        redirectUris: oauthClients.redirectUris,
        allowedScopes: oauthClients.allowedScopes,
        createdAt: oauthClients.createdAt,
      })
      .from(oauthClients)
      .where(eq(oauthClients.ownerUserId, user.id))
      .orderBy(desc(oauthClients.createdAt)),
    unreadCount(user.id),
    listNotifications({ userId: user.id, onlyUnread: false, limit: 5 }),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{user.displayName}</h1>
          <p className="text-neutral-600">
            @{user.handle} · <Link href={`/@${user.handle}`} className="underline">public profile</Link> ·{" "}
            <Link href="/feed" className="underline">feed</Link> ·{" "}
            <Link href="/dashboard/bookmarks" className="underline">bookmarks</Link>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="relative inline-flex items-center rounded-full border border-neutral-300 px-3 py-1.5 text-sm">
            Notifications
            {unread > 0 ? (
              <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-xs font-semibold text-white">
                {unread}
              </span>
            ) : null}
          </span>
          <form action="/api/auth/logout" method="post">
            <button className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm">Sign out</button>
          </form>
        </div>
      </header>

      {recentNotifications.items.length ? (
        <section className="mt-8 rounded-md border border-neutral-200">
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2 text-sm">
            <span className="font-medium">Recent activity</span>
            <span className="text-xs text-neutral-500">{unread} unread</span>
          </div>
          <ul className="divide-y divide-neutral-200">
            {recentNotifications.items.map((n) => (
              <li key={n.id} className={`px-4 py-3 text-sm ${n.readAt ? "text-neutral-500" : "text-neutral-900"}`}>
                <span className="font-medium">{n.kind}</span>
                <span className="ml-2 text-xs text-neutral-500">
                  {new Date(n.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-12">
        <h2 className="text-xl font-semibold">API keys</h2>
        <p className="mt-1 text-sm text-neutral-600">Scoped tokens for agents. Treat them like passwords.</p>
        <ApiKeyManager initialKeys={keys} />
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">OAuth apps</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Register OAuth 2.1 clients so third-party agent platforms can request scoped API keys on your behalf via the
          authorization-code + PKCE flow. See <Link href="/docs/oauth" className="underline">/docs/oauth</Link>.
        </p>
        <OAuthApps initial={oauthApps} />
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
