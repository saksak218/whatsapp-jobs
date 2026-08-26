import { closeDatabase } from "../db/client.js";
import { suppressUnsentJobs } from "../dedupe.js";

const jobId = process.argv.find((argument) => argument.startsWith("--job-id="))
  ?.slice("--job-id=".length)
  .trim();
const confirmed = process.argv.includes("--confirm");

if (!jobId || !confirmed) {
  throw new Error("Usage: tsx src/scripts/suppressJob.ts --job-id=<exact-id> --confirm");
}

try {
  await suppressUnsentJobs([jobId]);
  console.log(JSON.stringify({ suppressedJobId: jobId }));
} finally {
  await closeDatabase();
}
