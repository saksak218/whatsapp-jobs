import { inArray } from "drizzle-orm";
import { config } from "../config.js";
import { closeDatabase, db } from "../db/client.js";
import { ignoredJobs } from "../db/schema.js";
import { dedupeAndInsert } from "../dedupe.js";
import { closeBrowserFallback } from "../scrapers/browserFetch.js";
import { getMatchingKeywords } from "../scrapers/helpers.js";
import { scrapeAll } from "../scrapers/index.js";

const sinceArgument = process.argv.find((argument) => argument.startsWith("--since="));
const since = new Date(sinceArgument?.split("=")[1] ?? "");
const confirmed = process.argv.includes("--confirm");

if (Number.isNaN(since.getTime())) {
  throw new Error(
    "Usage: npm run suppressed:replay -- --since=<ISO-8601 date> [--confirm]",
  );
}

try {
  const scrapedJobs = await scrapeAll();
  const eligibleJobs = scrapedJobs.filter(
    (job) =>
      job.posted_at &&
      job.posted_at.getTime() >= since.getTime() &&
      getMatchingKeywords(job, config.searchKeywords).length > 0,
  );
  const candidateIds = [...new Set(eligibleJobs.map((job) => job.job_id))];
  const suppressedRows = candidateIds.length
    ? await db
        .select({ job_id: ignoredJobs.job_id })
        .from(ignoredJobs)
        .where(inArray(ignoredJobs.job_id, candidateIds))
    : [];
  const suppressedIds = new Set(suppressedRows.map((row) => row.job_id));
  const replayJobs = eligibleJobs.filter((job) => suppressedIds.has(job.job_id));

  if (!confirmed) {
    console.log(
      JSON.stringify(
        {
          confirmed: false,
          since: since.toISOString(),
          replayCandidates: replayJobs.map((job) => ({
            job_id: job.job_id,
            title: job.title,
            posted_at: job.posted_at?.toISOString(),
            url: job.url,
          })),
        },
        null,
        2,
      ),
    );
    process.exitCode = replayJobs.length > 0 ? 2 : 0;
  } else if (replayJobs.length > 0) {
    await db.transaction(async (tx) => {
      await tx
        .delete(ignoredJobs)
        .where(inArray(ignoredJobs.job_id, replayJobs.map((job) => job.job_id)));
    });
    const insertedJobs = await dedupeAndInsert(replayJobs);
    console.log(
      JSON.stringify({
        confirmed: true,
        since: since.toISOString(),
        queuedJobs: insertedJobs.map((job) => ({
          job_id: job.job_id,
          title: job.title,
          posted_at: job.posted_at?.toISOString(),
        })),
      }),
    );
  } else {
    console.log(
      JSON.stringify({ confirmed: true, since: since.toISOString(), queuedJobs: [] }),
    );
  }
} finally {
  await closeBrowserFallback();
  await closeDatabase();
}
