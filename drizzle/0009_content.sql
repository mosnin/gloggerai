CREATE TABLE IF NOT EXISTS post_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  revision_number integer NOT NULL,
  title text NOT NULL,
  subtitle text,
  content_md text NOT NULL,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  seo_title text,
  seo_description text,
  cover_image_url text,
  status text NOT NULL,
  edited_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  edited_by_api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS post_revisions_post_rev_idx ON post_revisions (post_id, revision_number);
CREATE INDEX IF NOT EXISTS post_revisions_post_idx ON post_revisions (post_id, revision_number);
