import "dotenv/config";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, {
  ssl: "require",
  max: 1,
  idle_timeout: 20,
  connect_timeout: 20,
});

const statements = `
CREATE TABLE IF NOT EXISTS seen_jobs (
  job_id text PRIMARY KEY,
  source text NOT NULL,
  title text NOT NULL,
  employer text,
  location text,
  salary text,
  url text NOT NULL,
  posted_at timestamptz,
  closing_at timestamptz,
  first_seen timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  raw jsonb
);

CREATE INDEX IF NOT EXISTS idx_seen_jobs_source ON seen_jobs(source);
CREATE INDEX IF NOT EXISTS idx_seen_jobs_sent_at ON seen_jobs(sent_at);
`;

try {
  await sql.unsafe(statements);
  console.log("Neon schema created successfully");
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  await sql.end();
}
