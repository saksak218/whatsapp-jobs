import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { filterAllowedLocations, uniqueJobsAcrossSources } from "./helpers.js";
import { scrapeHealthJobsUk } from "./healthJobsUk.js";
import { scrapeHscni } from "./hscni.js";
import { scrapeJobsNhsUk } from "./jobsNhsUk.js";
import { scrapeNhsJobsCom } from "./nhsJobsCom.js";
import { scrapeNhsScotland } from "./nhsScotland.js";
import type { NormalizedJob, Scraper } from "./types.js";

async function runScraper(
  name: string,
  scraper: Scraper,
): Promise<NormalizedJob[]> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(
          new Error(
            `${name} scraper timed out after ${config.scraperTimeoutMs}ms`,
          ),
        );
      }, config.scraperTimeoutMs);
    });

    const jobs = await Promise.race([scraper(), timeoutPromise]);
    logger.info({ source: name, count: jobs.length }, "scraper completed");
    return jobs;
  } catch (error) {
    logger.error(
      { source: name, error, timeoutMs: config.scraperTimeoutMs },
      "scraper failed; continuing with other sources",
    );
    return [];
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function scrapeAll(): Promise<NormalizedJob[]> {
  const scrapers: Array<[string, Scraper]> = [];

  if (config.sources.healthJobsUk) scrapers.push(["healthjobsuk", scrapeHealthJobsUk]);
  if (config.sources.jobsNhsUk) scrapers.push(["jobs-nhs-uk", scrapeJobsNhsUk]);
  if (config.sources.nhsScotland) scrapers.push(["nhs-scotland", scrapeNhsScotland]);
  if (config.sources.nhsJobsCom) scrapers.push(["nhsjobs-com", scrapeNhsJobsCom]);
  if (config.sources.hscni) scrapers.push(["hscni", scrapeHscni]);

  const results = await Promise.all(
    scrapers.map(([name, scraper]) => runScraper(name, scraper)),
  );

  return uniqueJobsAcrossSources(filterAllowedLocations(results.flat()));
}
