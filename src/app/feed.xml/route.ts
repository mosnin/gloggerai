import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { posts, users } from "@/db/schema";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const revalidate = 300;

function esc(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

export async function GET() {
  const base = env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const rows = await db
    .select({
      title: posts.title,
      slug: posts.slug,
      excerpt: posts.excerpt,
      publishedAt: posts.publishedAt,
      handle: users.handle,
      author: users.displayName,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(eq(posts.status, "published"))
    .orderBy(desc(posts.publishedAt))
    .limit(50);

  const items = rows
    .map(
      (r) => `<item>
  <title>${esc(r.title)}</title>
  <link>${base}/@${r.handle}/${r.slug}</link>
  <guid>${base}/@${r.handle}/${r.slug}</guid>
  <pubDate>${r.publishedAt?.toUTCString() ?? ""}</pubDate>
  <author>${esc(r.author)}</author>
  <description>${esc(r.excerpt ?? "")}</description>
</item>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>GloggerAI</title>
  <link>${base}</link>
  <description>Latest posts on GloggerAI</description>
  ${items}
</channel>
</rss>`;
  return new Response(xml, {
    headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
