import { config } from "../config.js";
import { closeDatabase } from "../db/client.js";
import { getUnsentJobs, markJobSent } from "../dedupe.js";
import { isExcludedSeniorRole } from "../scrapers/helpers.js";
import { logger } from "../utils/logger.js";
import { randomDelay, sleep } from "../utils/sleep.js";
import { closeWhatsAppClient, startWhatsAppClient } from "../whatsapp/client.js";
import { sendJobAlert } from "../whatsapp/send.js";

const limitArgument = process.argv.find((argument) => argument.startsWith("--limit="));
const limit = Number.parseInt(limitArgument?.split("=")[1] ?? "", 10);
const confirmed = process.argv.includes("--confirm");

if (!confirmed || !Number.isInteger(limit) || limit <= 0) {
  throw new Error("Usage: npm run pending:send -- --limit=<positive integer> --confirm");
}

let sentJobs = 0;
try {
  const pendingJobs = (await getUnsentJobs())
    .filter((job) => !isExcludedSeniorRole(job))
    .sort((left, right) => right.first_seen.getTime() - left.first_seen.getTime())
    .slice(0, limit)
    .sort((left, right) => left.first_seen.getTime() - right.first_seen.getTime());

  await startWhatsAppClient();

  for (const [index, job] of pendingJobs.entries()) {
    const sent = await sendJobAlert(job);
    if (!sent) continue;

    await markJobSent(job.job_id);
    sentJobs += 1;

    if (index < pendingJobs.length - 1) {
      await sleep(randomDelay(config.sendMinDelayMs, config.sendMaxDelayMs));
    }
  }

  logger.info({ selectedJobs: pendingJobs.length, sentJobs }, "pending send completed");
} finally {
  await closeWhatsAppClient();
  await closeDatabase();
}
