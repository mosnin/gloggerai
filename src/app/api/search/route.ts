import { NextRequest } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { fail, ok } from "@/lib/api/response";

const Q = z.object({
  q: z.string().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = Q.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return fail("invalid_query", "Invalid query parameters", 422);
  const { q, limit } = parsed.data;

  const rows = await db.execute(sql`
    SELECT
      p.id, p.slug, p.title, p.subtitle, p.excerpt, p.tags,
      p.reading_time_minutes AS "readingTimeMinutes",
      p.published_at AS "publishedAt",
      u.handle AS "authorHandle",
      u.display_name AS "authorDisplayName",
      ts_rank_cd(p.search, plainto_tsquery('english', ${q})) AS rank
    FROM posts p
    JOIN users u ON u.id = p.author_id
    WHERE p.status = 'published'
      AND p.search @@ plainto_tsquery('english', ${q})
    ORDER BY rank DESC, p.published_at DESC
    LIMIT ${limit}
  `);

  return ok({ query: q, items: rows.rows });
}
