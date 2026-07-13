import { config } from "../config.js";
import { parseUkDate } from "../utils/dates.js";
import {
  absoluteUrl,
  buildJobId,
  filterMatchingJobs,
  fetchFirstHtml,
  loadHtml,
  logScraperFailure,
  text,
  uniqueJobs
} from "./helpers.js";
import type { NormalizedJob } from "./types.js";

const source = "nhs-scotland" as const;
const baseUrl = "https://apply.jobs.scot.nhs.uk";

function buildSearchUrls(keyword: string): string[] {
  const jobCardUrl = new URL("/Home/_JobCard", baseUrl);
  jobCardUrl.searchParams.set("what", keyword);

  const keywordJobCardUrl = new URL("/Home/_JobCard", baseUrl);
  keywordJobCardUrl.searchParams.set("keywords", keyword);

  const fullPageUrl = new URL("/Home/Job", baseUrl);
  fullPageUrl.searchParams.set("keywords", keyword);

  return [
    jobCardUrl.toString(),
    keywordJobCardUrl.toString(),
    fullPageUrl.toString(),
  ];
}

export async function scrapeNhsScotland(): Promise<NormalizedJob[]> {
  const allJobs: NormalizedJob[] = [];
  const failures: string[] = [];

  for (const keyword of config.searchKeywords) {
    try {
      const { html, url: searchUrl } = await fetchFirstHtml(buildSearchUrls(keyword));
      const $ = loadHtml(html);
      const jobs: NormalizedJob[] = [];

      $(".job-card").each((index, element) => {
        const card = $(element);
        const link = card.find(".job-row__details a").first();
        const href = link.attr("href");
        const title = text(link);
        if (!href || !title || title.length < 4) return;

        const url = absoluteUrl(href, baseUrl);
        const parsed = new URL(url);
        const queryId = parsed.searchParams.get("JobId") ?? parsed.searchParams.get("jobId");

        const employer = card.find(".jobdetailsitem.school").text().replace("Employer (NHS Board):", "").trim() || undefined;
        const location = card.find(".jobdetailsitem.location").text().replace("Location:", "").trim() || undefined;
        const salary = card.find(".jobdetailsitem.salary").text().replace("Salary:", "").trim() || undefined;
        const closingText = card.find(".jobdetailsitem.closingdate").text().replace("Closing date:", "").trim() || undefined;
        const postedText = card.find(".jobdetailsitem.livedate").text().replace("Live date:", "").trim() || undefined;

        jobs.push({
          job_id: queryId ? `${source}:${queryId}` : buildJobId(source, url, String(index)),
          source,
          title,
          employer,
          location,
          salary,
          url,
          posted_at: parseUkDate(postedText),
          closing_at: parseUkDate(closingText),
          raw: { searchUrl, keyword }
        });
      });

      allJobs.push(...jobs);
    } catch (error) {
      failures.push(`${keyword}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length > 0) {
    logScraperFailure(source, new Error(`Some NHS Scotland keyword searches failed. ${failures.join(" | ")}`));
  }

  return filterMatchingJobs(uniqueJobs(allJobs), config.searchKeywords);
}
