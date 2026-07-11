import { scrapeHealthJobsUk } from "./src/scrapers/healthJobsUk.js";
import { scrapeJobsNhsUk } from "./src/scrapers/jobsNhsUk.js";
import { scrapeNhsScotland } from "./src/scrapers/nhsScotland.js";
import { scrapeNhsJobsCom } from "./src/scrapers/nhsJobsCom.js";

async function runTest() {
  console.log("--- Testing scrapeHealthJobsUk ---");
  try {
    const jobs = await scrapeHealthJobsUk();
    console.log(`Success: Found ${jobs.length} jobs.`);
    if (jobs.length > 0) {
      console.log(JSON.stringify(jobs.slice(0, 2), null, 2));
    }
  } catch (error) {
    console.error("Failed:", error);
  }

  console.log("\n--- Testing scrapeJobsNhsUk ---");
  try {
    const jobs = await scrapeJobsNhsUk();
    console.log(`Success: Found ${jobs.length} jobs.`);
    if (jobs.length > 0) {
      console.log(JSON.stringify(jobs.slice(0, 2), null, 2));
    }
  } catch (error) {
    console.error("Failed:", error);
  }

  console.log("\n--- Testing scrapeNhsScotland ---");
  try {
    const jobs = await scrapeNhsScotland();
    console.log(`Success: Found ${jobs.length} jobs.`);
    if (jobs.length > 0) {
      console.log(JSON.stringify(jobs.slice(0, 2), null, 2));
    }
  } catch (error) {
    console.error("Failed:", error);
  }

  console.log("\n--- Testing scrapeNhsJobsCom ---");
  try {
    const jobs = await scrapeNhsJobsCom();
    console.log(`Success: Found ${jobs.length} jobs.`);
    if (jobs.length > 0) {
      console.log(JSON.stringify(jobs.slice(0, 2), null, 2));
    }
  } catch (error) {
    console.error("Failed:", error);
  }
}

runTest().then(() => console.log("Done")).catch(console.error);
