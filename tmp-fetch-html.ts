import fs from "fs";
import { fetchHtml } from "./src/scrapers/helpers.js";

async function saveHtml(name: string, url: string) {
  try {
    console.log(`Fetching ${name} from ${url}...`);
    const html = await fetchHtml(url);
    const filename = `tmp-${name}.html`;
    fs.writeFileSync(filename, html);
    console.log(`Saved ${name} HTML to ${filename} (${html.length} bytes)`);
  } catch (error) {
    console.error(`Failed to fetch ${name}:`, error instanceof Error ? error.message : String(error));
  }
}

async function run() {
  await saveHtml("healthjobsuk", "https://www.healthjobsuk.com/job_list?JobSearch_q=junior+clinical+fellow&JobSearch_d=&JobSearch_g=255&JobSearch_re=*POST&JobSearch_re_0=1&JobSearch_Submit=Search&_tr=JobSearch");
  await saveHtml("jobs-nhs-uk", "https://www.jobs.nhs.uk/candidate/search/results?keyword=junior+clinical+fellow&sort=publicationDateDesc");
  await saveHtml("nhs-scotland", "https://apply.jobs.scot.nhs.uk/Home/Job?keywords=junior+clinical+fellow");
  await saveHtml("nhsjobs-com", "https://www.nhsjobs.com/search?q=junior+clinical+fellow");
}

run().catch(console.error);
