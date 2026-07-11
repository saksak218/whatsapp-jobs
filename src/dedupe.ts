import { isNull, sql } from "drizzle-orm";
import { db } from "./db/client.js";
import { seenJobs } from "./db/schema.js";
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
    raw: row.raw,
  };
}

export function mergeJobsForDelivery(
  newJobs: SeenJob[],
  pendingJobs: SeenJob[],
): SeenJob[] {
  const byId = new Map<string, SeenJob>();

  for (const job of [...pendingJobs, ...newJobs]) {
    if (!byId.has(job.job_id)) {
      byId.set(job.job_id, job);
    }
  }

  return Array.from(byId.values());
}

export async function getUnsentJobs(): Promise<SeenJob[]> {
  const rows = await db
    .select()
    .from(seenJobs)
    .where(isNull(seenJobs.sent_at))
    .orderBy(seenJobs.first_seen);

  return rows.map((row) => rowToSeenJob(row as Record<string, unknown>));
}

export async function dedupeAndInsert(
  jobs: NormalizedJob[],
): Promise<SeenJob[]> {
  const newJobs: SeenJob[] = [];

  for (const job of jobs) {
    const inserted = await db
      .insert(seenJobs)
      .values({
        job_id: job.job_id,
        source: job.source,
        title: job.title,
        employer: job.employer ?? null,
        location: job.location ?? null,
        salary: job.salary ?? null,
        url: job.url,
        posted_at: nullableDate(job.posted_at),
        closing_at: nullableDate(job.closing_at),
        raw: job.raw ? JSON.stringify(job.raw) : null,
      })
      .onConflictDoNothing()
      .returning();

    if (inserted[0]) {
      newJobs.push(rowToSeenJob(inserted[0] as Record<string, unknown>));
    }
  }

  return newJobs;
}

export async function markJobSent(jobId: string): Promise<void> {
  await db
    .update(seenJobs)
    .set({ sent_at: sql`now()` })
    .where(sql`${seenJobs.job_id} = ${jobId}`);
}
