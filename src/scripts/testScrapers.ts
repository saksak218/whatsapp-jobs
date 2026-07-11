import { scrapeAll } from "../scrapers/index.js";
import { logger } from "../utils/logger.js";

const jobs = await scrapeAll();

logger.info({ count: jobs.length }, "scraper test completed");
console.log(JSON.stringify(jobs, null, 2));
