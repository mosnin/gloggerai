CREATE TABLE IF NOT EXISTS oauth_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id text NOT NULL UNIQUE,
  client_secret_hash text NOT NULL,
  name text NOT NULL,
  redirect_uris jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oauth_clients_owner_idx ON oauth_clients (owner_user_id);

CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  code_hash text PRIMARY KEY,
  client_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  code_challenge_method text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX IF NOT EXISTS oauth_codes_user_idx ON oauth_authorization_codes (user_id);
