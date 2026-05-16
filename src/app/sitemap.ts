import type { MetadataRoute } from "next";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { posts, users } from "@/db/schema";
import { env } from "@/lib/env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const rows = await db
    .select({
      slug: posts.slug,
      updatedAt: posts.updatedAt,
      handle: users.handle,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(eq(posts.status, "published"))
    .orderBy(desc(posts.publishedAt))
    .limit(50_000);

  const base = env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    ...rows.map((r) => ({
      url: `${base}/@${r.handle}/${r.slug}`,
      lastModified: r.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
