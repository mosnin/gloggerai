ALTER TABLE posts ADD COLUMN IF NOT EXISTS claps_total integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES comments(id) ON DELETE CASCADE,
  body_md text NOT NULL,
  moderation_status moderation_status NOT NULL DEFAULT 'pending',
  moderation_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comments_post_created_idx ON comments (post_id, created_at);
CREATE INDEX IF NOT EXISTS comments_parent_idx ON comments (parent_id);
CREATE INDEX IF NOT EXISTS comments_author_idx ON comments (author_id);

CREATE TABLE IF NOT EXISTS claps (
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  count integer NOT NULL CHECK (count BETWEEN 1 AND 50),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS claps_post_idx ON claps (post_id);

CREATE TABLE IF NOT EXISTS bookmarks (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS bookmarks_user_created_idx ON bookmarks (user_id, created_at);

CREATE TABLE IF NOT EXISTS follows (
  follower_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX IF NOT EXISTS follows_followee_idx ON follows (followee_id);
CREATE INDEX IF NOT EXISTS follows_follower_idx ON follows (follower_id);

CREATE TABLE IF NOT EXISTS topic_follows (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tag)
);
CREATE INDEX IF NOT EXISTS topic_follows_tag_idx ON topic_follows (tag);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  post_id uuid,
  actor_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications (user_id, created_at);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON notifications (user_id, read_at);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_idx ON notifications (user_id, kind, post_id, actor_id);
