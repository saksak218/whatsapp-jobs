CREATE TABLE IF NOT EXISTS ignored_jobs (
  job_id      TEXT PRIMARY KEY,
  ignored_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
