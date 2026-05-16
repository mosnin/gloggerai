import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { embedText, toVectorLiteral } from "./provider";

function hashContent(title: string, body: string): string {
  return createHash("sha256").update(`${title}\n\n${body}`).digest("hex");
}

export async function upsertPostEmbedding(opts: {
  postId: string;
  title: string;
  body: string;
}): Promise<{ status: "stored" | "skipped" | "unchanged" }> {
  const ch = hashContent(opts.title, opts.body);
  const existing = await db.execute(
    sql`SELECT content_hash FROM post_embeddings WHERE post_id = ${opts.postId} LIMIT 1`,
  );
  if ((existing.rows[0] as { content_hash?: string } | undefined)?.content_hash === ch) {
    return { status: "unchanged" };
  }
  const result = await embedText(`${opts.title}\n\n${opts.body}`);
  if (!result) return { status: "skipped" };
  const lit = toVectorLiteral(result.vector);
  await db.execute(sql`
    INSERT INTO post_embeddings (post_id, embedding, model, content_hash)
    VALUES (${opts.postId}, ${lit}::vector, ${result.model}, ${ch})
    ON CONFLICT (post_id) DO UPDATE
      SET embedding = EXCLUDED.embedding,
          model = EXCLUDED.model,
          content_hash = EXCLUDED.content_hash,
          created_at = now()
  `);
  return { status: "stored" };
}

export type SemanticHit = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  tags: string[];
  readingTimeMinutes: number;
  publishedAt: string | Date | null;
  authorHandle: string;
  authorDisplayName: string;
  similarity: number;
};

type SemanticRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  tags: string[] | null;
  readingTimeMinutes: number;
  publishedAt: string | Date | null;
  authorHandle: string;
  authorDisplayName: string;
  similarity: number | string;
};

function normalizeHit(r: SemanticRow): SemanticHit {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    subtitle: r.subtitle,
    excerpt: r.excerpt,
    tags: r.tags ?? [],
    readingTimeMinutes: r.readingTimeMinutes,
    publishedAt: r.publishedAt,
    authorHandle: r.authorHandle,
    authorDisplayName: r.authorDisplayName,
    similarity: typeof r.similarity === "string" ? Number(r.similarity) : r.similarity,
  };
}

export async function semanticSearch(opts: {
  query: string;
  limit: number;
  excludePostId?: string;
}): Promise<SemanticHit[]> {
  const embedded = await embedText(opts.query);
  if (!embedded) return [];
  const lit = toVectorLiteral(embedded.vector);
  const exclude = opts.excludePostId ?? "00000000-0000-0000-0000-000000000000";
  const res = await db.execute(sql`
    SELECT
      p.id, p.slug, p.title, p.subtitle, p.excerpt, p.tags,
      p.reading_time_minutes AS "readingTimeMinutes",
      p.published_at AS "publishedAt",
      u.handle AS "authorHandle",
      u.display_name AS "authorDisplayName",
      1 - (e.embedding <=> ${lit}::vector) AS similarity
    FROM post_embeddings e
    JOIN posts p ON p.id = e.post_id
    JOIN users u ON u.id = p.author_id
    WHERE p.status = 'published'
      AND p.id <> ${exclude}
    ORDER BY e.embedding <=> ${lit}::vector
    LIMIT ${opts.limit}
  `);
  return (res.rows as unknown as SemanticRow[]).map(normalizeHit);
}

export async function relatedPostsByEmbedding(postId: string, limit = 5): Promise<SemanticHit[]> {
  const res = await db.execute(sql`
    WITH src AS (
      SELECT embedding FROM post_embeddings WHERE post_id = ${postId} LIMIT 1
    )
    SELECT
      p.id, p.slug, p.title, p.subtitle, p.excerpt, p.tags,
      p.reading_time_minutes AS "readingTimeMinutes",
      p.published_at AS "publishedAt",
      u.handle AS "authorHandle",
      u.display_name AS "authorDisplayName",
      1 - (e.embedding <=> (SELECT embedding FROM src)) AS similarity
    FROM post_embeddings e
    JOIN posts p ON p.id = e.post_id
    JOIN users u ON u.id = p.author_id, src
    WHERE p.status = 'published'
      AND p.id <> ${postId}
    ORDER BY e.embedding <=> (SELECT embedding FROM src)
    LIMIT ${limit}
  `);
  return (res.rows as unknown as SemanticRow[]).map(normalizeHit);
}
