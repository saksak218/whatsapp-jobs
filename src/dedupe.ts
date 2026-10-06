import { and, inArray, isNull, sql } from "drizzle-orm";
import { db } from "./db/client.js";
import { ignoredJobs, seenJobs } from "./db/schema.js";
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
  const uniqueJobs = Array.from(
    new Map(jobs.map((job) => [job.job_id, job])).values(),
  );
  const jobIds = uniqueJobs.map((job) => job.job_id);
  const ignoredRows = jobIds.length
    ? await db
        .select({ job_id: ignoredJobs.job_id })
        .from(ignoredJobs)
        .where(inArray(ignoredJobs.job_id, jobIds))
    : [];
  const ignoredIds = new Set(ignoredRows.map((row) => row.job_id));
  const insertableJobs = uniqueJobs.filter((job) => !ignoredIds.has(job.job_id));

  if (insertableJobs.length === 0) return [];

  const inserted = await db
    .insert(seenJobs)
    .values(
      insertableJobs.map((job) => ({
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
      })),
    )
    .onConflictDoNothing()
    .returning();

  return inserted.map((row) => rowToSeenJob(row as Record<string, unknown>));
}

export async function markJobSent(jobId: string): Promise<void> {
  await db
    .update(seenJobs)
    .set({ sent_at: sql`now()` })
    .where(sql`${seenJobs.job_id} = ${jobId}`);
}

export async function suppressUnsentJobs(jobIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(jobIds)];
  if (uniqueIds.length === 0) return;

  await db.transaction(async (tx) => {
    await tx
      .insert(ignoredJobs)
      .values(uniqueIds.map((jobId) => ({ job_id: jobId })))
      .onConflictDoNothing();

    await tx
      .delete(seenJobs)
      .where(and(isNull(seenJobs.sent_at), inArray(seenJobs.job_id, uniqueIds)));
  });
}

export async function cleanupSentJobsOlderThan(days: number): Promise<number> {
  if (days <= 0) return 0;

  const deletedRows = await db
    .delete(seenJobs)
    .where(sql`
      ${seenJobs.sent_at} is not null
      and ${seenJobs.first_seen} < now() - (${days}::text || ' days')::interval
    `)
    .returning({ job_id: seenJobs.job_id });

  return deletedRows.length;
}
