import { scrapeNhsScotland } from "./src/scrapers/nhsScotland.js";
import { config } from "./src/config.js";

async function main() {
  console.log("Mocking config.searchKeyword to 'clinical fellow'...");
  Object.defineProperty(config, 'searchKeyword', { value: 'clinical fellow', writable: true });
  
  const jobs = await scrapeNhsScotland();
  console.log(`Parsed ${jobs.length} jobs from NHS Scotland:`);
  console.log(JSON.stringify(jobs, null, 2));
}

main().catch(console.error);
