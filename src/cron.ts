import cron from "node-cron";
import { config } from "./config.js";
import { dedupeAndInsert, markJobSent } from "./dedupe.js";
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
    logger.info({ scraped: jobs.length, newJobs: newJobs.length }, "dedupe completed");

    for (const job of newJobs) {
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
