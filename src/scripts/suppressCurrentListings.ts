import { inArray, isNull } from "drizzle-orm";
import { closeDatabase, db } from "../db/client.js";
import { ignoredJobs, seenJobs } from "../db/schema.js";
import { closeBrowserFallback } from "../scrapers/browserFetch.js";
import { scrapeAll } from "../scrapers/index.js";

try {
  const [scrapedJobs, pendingRows] = await Promise.all([
    scrapeAll(),
    db
      .select({ job_id: seenJobs.job_id })
      .from(seenJobs)
      .where(isNull(seenJobs.sent_at)),
  ]);
  const protectedIds = new Set(pendingRows.map((row) => row.job_id));
  const idsToSuppress = [
    ...new Set(
      scrapedJobs
        .map((job) => job.job_id)
        .filter((jobId) => !protectedIds.has(jobId)),
    ),
  ];

  if (idsToSuppress.length > 0) {
    await db
      .insert(ignoredJobs)
      .values(idsToSuppress.map((job_id) => ({ job_id })))
      .onConflictDoNothing();
  }

  const suppressedRows = idsToSuppress.length
    ? await db
        .select({ job_id: ignoredJobs.job_id })
        .from(ignoredJobs)
        .where(inArray(ignoredJobs.job_id, idsToSuppress))
    : [];

  console.log(
    JSON.stringify({
      scrapedListings: scrapedJobs.length,
      protectedPendingJobs: protectedIds.size,
      suppressedCurrentListings: suppressedRows.length,
    }),
  );
} finally {
  await closeBrowserFallback();
  await closeDatabase();
}
