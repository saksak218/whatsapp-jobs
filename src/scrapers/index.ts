import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { uniqueJobs } from "./helpers.js";
import { scrapeHealthJobsUk } from "./healthJobsUk.js";
import { scrapeHscni } from "./hscni.js";
import { scrapeJobsNhsUk } from "./jobsNhsUk.js";
import { scrapeNhsJobsCom } from "./nhsJobsCom.js";
import { scrapeNhsScotland } from "./nhsScotland.js";
import type { NormalizedJob, Scraper } from "./types.js";

export async function scrapeAll(): Promise<NormalizedJob[]> {
  const scrapers: Array<[string, Scraper]> = [];

  if (config.sources.healthJobsUk) scrapers.push(["healthjobsuk", scrapeHealthJobsUk]);
  if (config.sources.jobsNhsUk) scrapers.push(["jobs-nhs-uk", scrapeJobsNhsUk]);
  if (config.sources.nhsScotland) scrapers.push(["nhs-scotland", scrapeNhsScotland]);
  if (config.sources.nhsJobsCom) scrapers.push(["nhsjobs-com", scrapeNhsJobsCom]);
  if (config.sources.hscni) scrapers.push(["hscni", scrapeHscni]);

  const results = await Promise.all(
    scrapers.map(async ([name, scraper]) => {
      const jobs = await scraper();
      logger.info({ source: name, count: jobs.length }, "scraper completed");
      return jobs;
    })
  );

  return uniqueJobs(results.flat());
}
