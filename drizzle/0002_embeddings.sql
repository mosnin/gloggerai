-- pgvector for semantic search + related posts.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS post_embeddings (
  post_id uuid PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  embedding vector(1536) NOT NULL,
  model text NOT NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- HNSW index for cosine similarity (pgvector >= 0.5).
CREATE INDEX IF NOT EXISTS post_embeddings_hnsw_idx
  ON post_embeddings USING hnsw (embedding vector_cosine_ops);
