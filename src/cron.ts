import cron from "node-cron";
import { config } from "./config.js";
import {
  cleanupSentJobsOlderThan,
  dedupeAndInsert,
  getUnsentJobs,
  markJobSent,
  mergeJobsForDelivery,
} from "./dedupe.js";
import { scrapeAll } from "./scrapers/index.js";
import { isExcludedSeniorRole } from "./scrapers/helpers.js";
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

async function runRetentionCleanup(): Promise<void> {
  try {
    const deletedJobs = await cleanupSentJobsOlderThan(config.dbRetentionDays);
    if (deletedJobs > 0) {
      logger.info(
        { deletedJobs, retentionDays: config.dbRetentionDays },
        "old sent jobs cleaned up",
      );
    }
  } catch (error) {
    logger.error({ error }, "old sent job cleanup failed");
  }
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
    const mergedJobs = mergeJobsForDelivery(newJobs, pendingJobs);
    const jobsToSend = mergedJobs.filter((job) => !isExcludedSeniorRole(job));
    const excludedSeniorJobs = mergedJobs.length - jobsToSend.length;
    logger.info(
      {
        scraped: jobs.length,
        newJobs: newJobs.length,
        pendingJobs: pendingJobs.length,
        excludedSeniorJobs,
      },
      "dedupe completed",
    );

    if (jobsToSend.length === 0) {
      logger.warn("no new or pending jobs found; skipping WhatsApp send");
      await runRetentionCleanup();
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
      let sent = false;
      try {
        sent = await sendJobAlert(job);
      } catch (error) {
        logger.error(
          { error, job_id: job.job_id, source: job.source },
          "WhatsApp job alert failed; job will remain pending",
        );
      }

      if (!sent) continue;

      await markJobSent(job.job_id);
      sentJobs += 1;

      const delayMs = randomDelay(config.sendMinDelayMs, config.sendMaxDelayMs);
      logger.info({ delayMs }, "waiting before next WhatsApp send");
      await sleep(delayMs);
    }

    await runRetentionCleanup();
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
