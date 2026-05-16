import { sql } from "drizzle-orm";
import { db } from "@/db/client";

export type FeedItem = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  tags: string[];
  readingTimeMinutes: number;
  publishedAt: Date | null;
  createdAt: Date;
  authorHandle: string;
  authorDisplayName: string;
  authorAvatarUrl: string | null;
  source: string;
};

const GLOBAL_RATIO = 0.2;

export async function getFeed(opts: {
  userId?: string | null;
  limit: number;
  cursor?: string;
}): Promise<{ items: FeedItem[]; nextCursor: string | null }> {
  const cursorClause = opts.cursor
    ? sql`AND p.created_at < ${new Date(opts.cursor)}::timestamptz`
    : sql``;

  if (!opts.userId) {
    const res = await db.execute<{
      id: string;
      slug: string;
      title: string;
      subtitle: string | null;
      excerpt: string | null;
      tags: string[];
      reading_time_minutes: number;
      published_at: Date | null;
      created_at: Date;
      handle: string;
      display_name: string;
      avatar_url: string | null;
      source: string;
    }>(sql`
      SELECT p.id, p.slug, p.title, p.subtitle, p.excerpt, p.tags, p.reading_time_minutes,
             p.published_at, p.created_at, u.handle, u.display_name, u.avatar_url,
             'global'::text AS source
      FROM posts p
      INNER JOIN users u ON u.id = p.author_id
      WHERE p.status = 'published' ${cursorClause}
      ORDER BY p.created_at DESC
      LIMIT ${opts.limit + 1}
    `);
    return shape(res.rows, opts.limit);
  }

  const globalLimit = Math.max(1, Math.floor(opts.limit * GLOBAL_RATIO));
  const personalLimit = opts.limit + globalLimit + 1;

  const res = await db.execute<{
    id: string;
    slug: string;
    title: string;
    subtitle: string | null;
    excerpt: string | null;
    tags: string[];
    reading_time_minutes: number;
    published_at: Date | null;
    created_at: Date;
    handle: string;
    display_name: string;
    avatar_url: string | null;
    source: string;
  }>(sql`
    WITH followed_user_posts AS (
      SELECT p.*, 'followee'::text AS source
      FROM posts p
      INNER JOIN follows f ON f.followee_id = p.author_id
      WHERE f.follower_id = ${opts.userId} AND p.status = 'published' ${cursorClause}
      ORDER BY p.created_at DESC
      LIMIT ${personalLimit}
    ),
    followed_topic_posts AS (
      SELECT p.*, 'topic'::text AS source
      FROM posts p
      WHERE p.status = 'published'
        AND p.tags ?| (SELECT array_agg(tag) FROM topic_follows WHERE user_id = ${opts.userId})
        ${cursorClause}
      ORDER BY p.created_at DESC
      LIMIT ${personalLimit}
    ),
    global_posts AS (
      SELECT p.*, 'global'::text AS source
      FROM posts p
      WHERE p.status = 'published' ${cursorClause}
      ORDER BY p.created_at DESC
      LIMIT ${globalLimit + 1}
    ),
    merged AS (
      SELECT DISTINCT ON (id) id, slug, title, subtitle, excerpt, tags, reading_time_minutes,
                              published_at, created_at, author_id, source
      FROM (
        SELECT * FROM followed_user_posts
        UNION ALL
        SELECT * FROM followed_topic_posts
        UNION ALL
        SELECT * FROM global_posts
      ) all_posts
      ORDER BY id, created_at DESC
    )
    SELECT m.id, m.slug, m.title, m.subtitle, m.excerpt, m.tags, m.reading_time_minutes,
           m.published_at, m.created_at, u.handle, u.display_name, u.avatar_url, m.source
    FROM merged m
    INNER JOIN users u ON u.id = m.author_id
    ORDER BY m.created_at DESC
    LIMIT ${opts.limit + 1}
  `);
  return shape(res.rows, opts.limit);
}

function shape(rows: any[], limit: number): { items: FeedItem[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    subtitle: r.subtitle,
    excerpt: r.excerpt,
    tags: r.tags,
    readingTimeMinutes: r.reading_time_minutes,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    authorHandle: r.handle,
    authorDisplayName: r.display_name,
    authorAvatarUrl: r.avatar_url,
    source: r.source,
  }));
  return {
    items,
    nextCursor: hasMore ? items[items.length - 1].createdAt.toISOString() : null,
  };
}
