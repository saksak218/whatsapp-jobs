import { config } from "../config.js";
import { parseUkDate } from "../utils/dates.js";
import {
  absoluteUrl,
  buildJobId,
  fetchHtml,
  filterAllowedLocations,
  filterMatchingJobs,
  fetchFirstHtml,
  getSearchKeywordsForSource,
  loadHtml,
  logScraperFailure,
  text,
  uniqueJobs
} from "./helpers.js";
import type { NormalizedJob } from "./types.js";

const source = "nhs-scotland" as const;
const baseUrl = "https://apply.jobs.scot.nhs.uk";
const pageSize = 12;

const relevantSalaryBands = [
  { id: "53", label: "Clinical Dev Fellow (FHO1)" },
  { id: "54", label: "Clinical Dev Fellow (FHO2)" },
  { id: "56", label: "Clinical Development Fellow" },
  { id: "59", label: "Clinical Fellow (FHO1)" },
  { id: "60", label: "Clinical Fellow (FHO2)" },
  { id: "69", label: "LAS - Core Trainee" },
  { id: "70", label: "LAS - FY1" },
  { id: "71", label: "LAS - FY2" },
  { id: "73", label: "LAT - Core Trainee" },
  { id: "96", label: "Clinical Fellow" },
  { id: "102", label: "Clinical Fellow (CT)" },
];

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

function buildSalaryBandUrl(salaryId: string, skip: number): string {
  const url = new URL("/Home/_JobCard", baseUrl);
  url.searchParams.set("Departments", "13");
  url.searchParams.set("Salary", salaryId);
  url.searchParams.set("Skip", String(skip));
  return url.toString();
}

function totalCurrentRecords(html: string): number {
  const match = /id=["']totalCurrentRecords["']\s+value=["'](\d+)["']/i.exec(html);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function parseNhsScotlandCards(
  html: string,
  searchUrl: string,
  keyword: string,
): NormalizedJob[] {
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

  return jobs;
}

export async function scrapeNhsScotland(): Promise<NormalizedJob[]> {
  const allJobs: NormalizedJob[] = [];
  const failures: string[] = [];
  const searchKeywords = getSearchKeywordsForSource(source);

  for (const keyword of searchKeywords) {
    try {
      const { html, url: searchUrl } = await fetchFirstHtml(buildSearchUrls(keyword));
      allJobs.push(...parseNhsScotlandCards(html, searchUrl, keyword));
    } catch (error) {
      failures.push(`${keyword}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const band of relevantSalaryBands) {
    for (let page = 0; page < config.nhsScotlandMaxPages; page += 1) {
      const skip = page * pageSize;
      const searchUrl = buildSalaryBandUrl(band.id, skip);

      try {
        const html = await fetchHtml(searchUrl);
        const pageJobs = parseNhsScotlandCards(html, searchUrl, band.label);
        allJobs.push(...pageJobs);

        if (pageJobs.length === 0 || totalCurrentRecords(html) < pageSize) {
          break;
        }
      } catch (error) {
        failures.push(`${band.label}: ${error instanceof Error ? error.message : String(error)}`);
        break;
      }
    }
  }

  if (failures.length > 0) {
    logScraperFailure(source, new Error(`Some NHS Scotland keyword searches failed. ${failures.join(" | ")}`));
  }

  return filterAllowedLocations(filterMatchingJobs(uniqueJobs(allJobs), searchKeywords));
}
