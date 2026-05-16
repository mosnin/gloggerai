-- Lightweight per-post view events with daily rollup for fast aggregates.
-- Real-time path uses ingest API; agents read from /api/posts/{id}/analytics.

CREATE TABLE IF NOT EXISTS post_views (
  id bigserial PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  referrer_host text,
  country text,
  ua_class text,
  is_bot boolean NOT NULL DEFAULT false,
  session_hash text
);
CREATE INDEX IF NOT EXISTS post_views_post_time_idx ON post_views (post_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS post_views_time_idx ON post_views (occurred_at);

CREATE TABLE IF NOT EXISTS post_views_daily (
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  day date NOT NULL,
  views integer NOT NULL DEFAULT 0,
  bot_views integer NOT NULL DEFAULT 0,
  unique_sessions integer NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, day)
);
