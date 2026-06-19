CREATE TABLE IF NOT EXISTS progress (
  session_id   uuid NOT NULL,
  problem_slug text NOT NULL,
  status       text NOT NULL CHECK (status IN ('todo','in-progress','complete')),
  revealed     boolean NOT NULL DEFAULT false,
  draft_code   text,
  started_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, problem_slug)
);

CREATE TABLE IF NOT EXISTS conversations (
  session_id   uuid NOT NULL,
  problem_slug text NOT NULL,
  messages     jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, problem_slug)
);

CREATE TABLE IF NOT EXISTS usage_events (
  id           bigserial PRIMARY KEY,
  session_id   uuid NOT NULL,
  problem_slug text NOT NULL,
  model        text NOT NULL,
  tokens_in    integer NOT NULL,
  tokens_out   integer NOT NULL,
  cost_usd     numeric(10,6) NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_progress_session ON progress (session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations (session_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_session ON usage_events (session_id);
