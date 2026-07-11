import cron from "node-cron";
import { config } from "./config.js";
import {
  dedupeAndInsert,
  getUnsentJobs,
  markJobSent,
  mergeJobsForDelivery,
} from "./dedupe.js";
import { scrapeAll } from "./scrapers/index.js";
import { logger } from "./utils/logger.js";
import { randomDelay, sleep } from "./utils/sleep.js";
import { sendJobAlert } from "./whatsapp/send.js";

let running = false;

export async function runScrapeCycle(): Promise<void> {
  if (running) {
    logger.warn("previous scrape cycle still running; skipping overlap");
    return;
  }

  running = true;

  try {
    logger.info("scrape cycle started");
    const jobs = await scrapeAll();
    const newJobs = await dedupeAndInsert(jobs);
    const pendingJobs = await getUnsentJobs();
    const jobsToSend = mergeJobsForDelivery(newJobs, pendingJobs);
    logger.info(
      {
        scraped: jobs.length,
        newJobs: newJobs.length,
        pendingJobs: pendingJobs.length,
      },
      "dedupe completed",
    );

    if (jobsToSend.length === 0) {
      logger.warn("no new or pending jobs found; skipping WhatsApp send");
      return;
    }

    for (const job of jobsToSend) {
      await sendJobAlert(job);
      await markJobSent(job.job_id);

      const delayMs = randomDelay(config.sendMinDelayMs, config.sendMaxDelayMs);
      logger.info({ delayMs }, "waiting before next WhatsApp send");
      await sleep(delayMs);
    }

    logger.info("scrape cycle finished");
  } catch (error) {
    logger.error({ error }, "scrape cycle failed");
  } finally {
    running = false;
  }
}

export function startScheduler(): void {
  cron.schedule(config.scrapeIntervalCron, () => {
    void runScrapeCycle();
  });

  logger.info({ cron: config.scrapeIntervalCron }, "scheduler started");
}
