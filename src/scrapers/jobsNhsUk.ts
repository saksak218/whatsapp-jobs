import { config } from "../config.js";
import { parseUkDate } from "../utils/dates.js";
import {
  absoluteUrl,
  buildJobId,
  fetchHtml,
  filterAllowedLocations,
  filterMatchingJobs,
  isPotentialJuniorJob,
  loadHtml,
  logScraperFailure,
  text,
  uniqueJobs
} from "./helpers.js";
import type { NormalizedJob } from "./types.js";

const source = "jobs-nhs-uk" as const;
const baseUrl = "https://www.jobs.nhs.uk";

function buildSearchUrl(keyword: string, page: number): string {
  const url = new URL("/candidate/search/results", baseUrl);
  if (keyword) url.searchParams.set("keyword", keyword);
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

async function enrichWithAdvertDetails(jobs: NormalizedJob[]): Promise<{
  jobs: NormalizedJob[];
  failures: string[];
}> {
  const candidates = jobs.filter(isPotentialJuniorJob);
  const failures: string[] = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < candidates.length) {
      const job = candidates[nextIndex];
      nextIndex += 1;

      try {
        const $ = loadHtml(await fetchHtml(job.url));
        $("script, style, noscript, svg").remove();
        job.classification_text = text($("main").first()) || text($("body"));
      } catch (error) {
        failures.push(`${job.job_id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, candidates.length) }, () => worker()));
  return { jobs, failures };
}

export async function scrapeJobsNhsUk(): Promise<NormalizedJob[]> {
  const jobs: NormalizedJob[] = [];
  const failures: string[] = [];
  let nextPage = 1;
  let lastPage = config.jobsNhsUkMaxPages;

  async function discoveryWorker(): Promise<void> {
    while (nextPage <= lastPage) {
      const page = nextPage;
      nextPage += 1;
      const searchUrl = buildSearchUrl("", page);
      try {
        const pageJobs = parseJobsNhsUkPage(await fetchHtml(searchUrl), searchUrl);
        if (pageJobs.length === 0) {
          lastPage = Math.min(lastPage, page - 1);
          continue;
        }
        jobs.push(...pageJobs);
      } catch (error) {
        failures.push(`page ${page}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(5, config.jobsNhsUkMaxPages) },
      () => discoveryWorker(),
    ),
  );

  if (failures.length > 0) {
    logScraperFailure(source, new Error(`NHS Jobs discovery failed. ${failures.join(" | ")}`));
  }

  const enriched = await enrichWithAdvertDetails(uniqueJobs(jobs));
  if (enriched.failures.length > 0) {
    logScraperFailure(
      source,
      new Error(`Some NHS Jobs advert details failed. ${enriched.failures.join(" | ")}`)
    );
  }

  return filterAllowedLocations(filterMatchingJobs(enriched.jobs, config.searchKeywords));
}
