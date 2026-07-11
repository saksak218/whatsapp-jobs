import { config } from "../config.js";
import { parseUkDate } from "../utils/dates.js";
import {
  absoluteUrl,
  buildJobId,
  fetchHtml,
  filterMatchingJobs,
  loadHtml,
  logScraperFailure,
  text
} from "./helpers.js";
import type { NormalizedJob } from "./types.js";

const source = "jobs-nhs-uk" as const;
const baseUrl = "https://www.jobs.nhs.uk";

function buildSearchUrl(): string {
  const url = new URL("/candidate/search/results", baseUrl);
  url.searchParams.set("keyword", config.searchKeyword);
  url.searchParams.set("sort", "publicationDateDesc");
  return url.toString();
}

export async function scrapeJobsNhsUk(): Promise<NormalizedJob[]> {
  try {
    const searchUrl = buildSearchUrl();
    const $ = loadHtml(await fetchHtml(searchUrl));
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

    return filterMatchingJobs(jobs, config.searchKeyword);
  } catch (error) {
    logScraperFailure(source, error);
    return [];
  }
}
