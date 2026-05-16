-- Durable jobs + outbound webhooks. Postgres-backed so we can run in-process or via cron;
-- swap to Inngest/Trigger.dev later without changing the producer side.

DO $$ BEGIN
  CREATE TYPE job_kind AS ENUM ('publish_scheduled', 'embed_post', 'deliver_webhook');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE job_status AS ENUM ('pending', 'running', 'done', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind job_kind NOT NULL,
  status job_status NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  run_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_ready_idx ON jobs (status, run_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS jobs_kind_idx ON jobs (kind);

ALTER TABLE posts ADD COLUMN IF NOT EXISTS publish_at timestamptz;
CREATE INDEX IF NOT EXISTS posts_publish_at_idx ON posts (publish_at) WHERE status = 'draft';

CREATE TABLE IF NOT EXISTS webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url text NOT NULL,
  secret text NOT NULL,
  events jsonb NOT NULL DEFAULT '[]',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhooks_user_idx ON webhooks (user_id);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb NOT NULL,
  status integer,
  response_body text,
  attempts integer NOT NULL DEFAULT 0,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
