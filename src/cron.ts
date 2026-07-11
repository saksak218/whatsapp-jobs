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

export interface ScrapeCycleResult {
  skipped: boolean;
  scraped: number;
  newJobs: number;
  pendingJobs: number;
  sentJobs: number;
}

export async function runScrapeCycle(): Promise<ScrapeCycleResult> {
  if (running) {
    logger.warn("previous scrape cycle still running; skipping overlap");
    return {
      skipped: true,
      scraped: 0,
      newJobs: 0,
      pendingJobs: 0,
      sentJobs: 0,
    };
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
      return {
        skipped: false,
        scraped: jobs.length,
        newJobs: newJobs.length,
        pendingJobs: pendingJobs.length,
        sentJobs: 0,
      };
    }

    let sentJobs = 0;
    for (const job of jobsToSend) {
      const sent = await sendJobAlert(job);
      if (!sent) continue;

      await markJobSent(job.job_id);
      sentJobs += 1;

      const delayMs = randomDelay(config.sendMinDelayMs, config.sendMaxDelayMs);
      logger.info({ delayMs }, "waiting before next WhatsApp send");
      await sleep(delayMs);
    }

    logger.info("scrape cycle finished");
    return {
      skipped: false,
      scraped: jobs.length,
      newJobs: newJobs.length,
      pendingJobs: pendingJobs.length,
      sentJobs,
    };
  } catch (error) {
    logger.error({ error }, "scrape cycle failed");
    throw error;
  } finally {
    running = false;
  }
}

export function startScheduler(): void {
  cron.schedule(config.scrapeIntervalCron, () => {
    void runScrapeCycle().catch((error) => {
      logger.error({ error }, "scheduled scrape cycle failed");
    });
  });

  logger.info({ cron: config.scrapeIntervalCron }, "scheduler started");
}
