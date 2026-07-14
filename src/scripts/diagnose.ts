import { desc, isNull, sql } from "drizzle-orm";
import { config } from "../config.js";
import { closeDatabase, db } from "../db/client.js";
import { seenJobs } from "../db/schema.js";
import { scrapeAll } from "../scrapers/index.js";

const jobs = await scrapeAll();
const bySource = new Map<string, number>();

for (const job of jobs) {
  bySource.set(job.source, (bySource.get(job.source) ?? 0) + 1);
}

const totalRows = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(seenJobs);

const unsentRows = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(seenJobs)
  .where(isNull(seenJobs.sent_at));

const recentRows = await db
  .select({
    job_id: seenJobs.job_id,
    source: seenJobs.source,
    title: seenJobs.title,
    first_seen: seenJobs.first_seen,
    sent_at: seenJobs.sent_at,
  })
  .from(seenJobs)
  .orderBy(desc(seenJobs.first_seen))
  .limit(10);

const seenRows = await db
  .select({ job_id: seenJobs.job_id })
  .from(seenJobs);
const seenIds = new Set(seenRows.map((row) => row.job_id));
const newCandidates = jobs.filter((job) => !seenIds.has(job.job_id));

console.log(JSON.stringify(
  {
    config: {
      scrapeIntervalCron: config.scrapeIntervalCron,
      dryRunSends: config.dryRunSends,
      disableWhatsAppSends: config.disableWhatsAppSends,
      sources: config.sources,
      searchKeywords: config.searchKeywords,
    },
    scrape: {
      total: jobs.length,
      bySource: Object.fromEntries(bySource.entries()),
      sample: jobs.slice(0, 10).map((job) => ({
        job_id: job.job_id,
        source: job.source,
        title: job.title,
        url: job.url,
      })),
      newCandidates: newCandidates.map((job) => ({
        job_id: job.job_id,
        source: job.source,
        title: job.title,
        url: job.url,
      })),
    },
    database: {
      totalSeen: totalRows[0]?.count ?? 0,
      unsent: unsentRows[0]?.count ?? 0,
      recent: recentRows,
    },
  },
  null,
  2,
));

await closeDatabase();
