-- Full-text search on posts.
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS search tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(subtitle, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(excerpt, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(content_md, '')), 'D')
  ) STORED;

CREATE INDEX IF NOT EXISTS posts_search_idx ON posts USING GIN (search);
CREATE INDEX IF NOT EXISTS posts_tags_gin_idx ON posts USING GIN (tags);
