CREATE TABLE IF NOT EXISTS seen_jobs (
  job_id      TEXT PRIMARY KEY,
  source      TEXT NOT NULL,
  title       TEXT NOT NULL,
  employer    TEXT,
  location    TEXT,
  salary      TEXT,
  url         TEXT NOT NULL,
  posted_at   TIMESTAMPTZ,
  closing_at  TIMESTAMPTZ,
  first_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at     TIMESTAMPTZ,
  raw         JSONB
);

CREATE INDEX IF NOT EXISTS idx_seen_jobs_source ON seen_jobs(source);
CREATE INDEX IF NOT EXISTS idx_seen_jobs_sent_at ON seen_jobs(sent_at);
