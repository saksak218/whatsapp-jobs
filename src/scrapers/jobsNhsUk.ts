import { config } from "../config.js";
import { parseUkDate } from "../utils/dates.js";
import {
  absoluteUrl,
  buildJobId,
  fetchHtml,
  filterMatchingJobs,
  loadHtml,
  logScraperFailure,
  text,
  uniqueJobs
} from "./helpers.js";
import type { NormalizedJob } from "./types.js";

const source = "jobs-nhs-uk" as const;
const baseUrl = "https://www.jobs.nhs.uk";

function buildSearchUrl(page: number): string {
  const url = new URL("/candidate/search/results", baseUrl);
  url.searchParams.set("keyword", config.searchKeyword);
  url.searchParams.set("staffGroup", "MEDICAL_AND_DENTAL");
  url.searchParams.set("sort", "publicationDateDesc");
  url.searchParams.set("skipPhraseSuggester", "true");
  if (page > 1) url.searchParams.set("page", String(page));
  return url.toString();
}

function parseJobsNhsUkPage(html: string, searchUrl: string): NormalizedJob[] {
  const $ = loadHtml(html);
  const jobs: NormalizedJob[] = [];

  $("a[href*='/candidate/jobadvert/']").each((index, element) => {
    const link = $(element);
    const href = link.attr("href");
    const title = text(link);
    if (!href || !title || /save this job/i.test(title)) return;

    const url = absoluteUrl(href, baseUrl);
    const container = link.closest("li, article, div");
    const containerText = text(container);
    const lines = containerText
      .split(/(?=Salary:|Date posted:|Closing date:|Contract type:|Working pattern:)/)
      .map((line) => line.trim())
      .filter(Boolean);

    const salary = /Salary:\s*([^]*?)(?=Date posted:|Closing date:|Contract type:|Working pattern:|$)/i
      .exec(containerText)?.[1]
      ?.trim();
    const postedText = /Date posted:\s*([^]*?)(?=Closing date:|Contract type:|Working pattern:|$)/i
      .exec(containerText)?.[1]
      ?.trim();
    const closingText = /Closing date:\s*([^]*?)(?=Contract type:|Working pattern:|$)/i
      .exec(containerText)?.[1]
      ?.trim();

    const reference = /\/candidate\/jobadvert\/([^/?#]+)/.exec(url)?.[1];

    jobs.push({
      job_id: reference ? `${source}:${reference}` : buildJobId(source, url, String(index)),
      source,
      title,
      employer: container.find("h3").first().text().replace(/\s+/g, " ").trim() || undefined,
      location: lines.find((line) => !/^(Salary|Date posted|Closing date|Contract type|Working pattern):/i.test(line) && line !== title),
      salary,
      url,
      posted_at: parseUkDate(postedText),
      closing_at: parseUkDate(closingText),
      raw: { searchUrl }
    });
  });

  return jobs;
}

export async function scrapeJobsNhsUk(): Promise<NormalizedJob[]> {
  try {
    const jobs: NormalizedJob[] = [];

    for (let page = 1; page <= config.jobsNhsUkMaxPages; page += 1) {
      const searchUrl = buildSearchUrl(page);
      const pageJobs = parseJobsNhsUkPage(await fetchHtml(searchUrl), searchUrl);
      if (pageJobs.length === 0) break;
      jobs.push(...pageJobs);
    }

    return filterMatchingJobs(uniqueJobs(jobs), config.searchKeyword);
  } catch (error) {
    logScraperFailure(source, error);
    return [];
  }
}
