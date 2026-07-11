import { pool } from "./db/client.js";
import type { NormalizedJob } from "./scrapers/types.js";

export interface SeenJob extends NormalizedJob {
  first_seen: Date;
  sent_at?: Date;
}

function nullableDate(value: Date | undefined): Date | null {
  return value ?? null;
}

function rowToSeenJob(row: Record<string, unknown>): SeenJob {
  return {
    job_id: String(row.job_id),
    source: row.source as SeenJob["source"],
    title: String(row.title),
    employer: row.employer ? String(row.employer) : undefined,
    location: row.location ? String(row.location) : undefined,
    salary: row.salary ? String(row.salary) : undefined,
    url: String(row.url),
    posted_at: row.posted_at instanceof Date ? row.posted_at : undefined,
    closing_at: row.closing_at instanceof Date ? row.closing_at : undefined,
    first_seen: row.first_seen instanceof Date ? row.first_seen : new Date(),
    sent_at: row.sent_at instanceof Date ? row.sent_at : undefined,
    raw: row.raw
  };
}

export async function dedupeAndInsert(jobs: NormalizedJob[]): Promise<SeenJob[]> {
  const newJobs: SeenJob[] = [];

  for (const job of jobs) {
    const result = await pool.query(
      `
        INSERT INTO seen_jobs (
          job_id, source, title, employer, location, salary, url, posted_at, closing_at, raw
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (job_id) DO NOTHING
        RETURNING *
      `,
      [
        job.job_id,
        job.source,
        job.title,
        job.employer ?? null,
        job.location ?? null,
        job.salary ?? null,
        job.url,
        nullableDate(job.posted_at),
        nullableDate(job.closing_at),
        job.raw ? JSON.stringify(job.raw) : null
      ]
    );

    if (result.rows[0]) {
      newJobs.push(rowToSeenJob(result.rows[0]));
    }
  }

  return newJobs;
}

export async function markJobSent(jobId: string): Promise<void> {
  await pool.query("UPDATE seen_jobs SET sent_at = now() WHERE job_id = $1", [jobId]);
}
