import { desc, isNull, sql } from "drizzle-orm";
import { closeDatabase, db } from "../db/client.js";
import { ignoredJobs, seenJobs } from "../db/schema.js";

try {
  const [counts, ignoredCounts, pendingJobs] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where ${seenJobs.sent_at} is null)::int`,
      })
      .from(seenJobs),
    db
      .select({ ignored: sql<number>`count(*)::int` })
      .from(ignoredJobs),
    db
      .select({
        job_id: seenJobs.job_id,
        source: seenJobs.source,
        title: seenJobs.title,
        first_seen: seenJobs.first_seen,
      })
      .from(seenJobs)
      .where(isNull(seenJobs.sent_at))
      .orderBy(desc(seenJobs.first_seen))
      .limit(20),
  ]);

  console.log(JSON.stringify({
    database: counts[0] ?? { total: 0, pending: 0 },
    suppression: ignoredCounts[0] ?? { ignored: 0 },
    pendingJobs,
  }, null, 2));
} finally {
  await closeDatabase();
}
