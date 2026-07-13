import { config } from "../config.js";
import {
  absoluteUrl,
  buildJobId,
  fetchFirstHtml,
  filterMatchingJobs,
  loadHtml,
  logBlockedSourceFallback,
  logScraperFailure,
  text,
  uniqueJobs
} from "./helpers.js";
import type { NormalizedJob } from "./types.js";

const source = "nhsjobs-com" as const;
const baseUrl = "https://www.nhsjobs.com";

function slugifyKeyword(keyword: string): string {
  return keyword
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildSearchUrls(keyword: string): string[] {
  const url = new URL("/search", baseUrl);
  url.searchParams.set("q", keyword);

  const keywordUrl = new URL("/search", baseUrl);
  keywordUrl.searchParams.set("keywords", keyword);

  return [
    url.toString(),
    keywordUrl.toString(),
    new URL(`/search-jobs/${slugifyKeyword(keyword)}`, baseUrl).toString(),
    baseUrl,
  ];
}

export async function scrapeNhsJobsCom(): Promise<NormalizedJob[]> {
  const jobs: NormalizedJob[] = [];
  const failures: string[] = [];

  for (const keyword of config.searchKeywords) {
    try {
    const { html, url: searchUrl } = await fetchFirstHtml(buildSearchUrls(keyword));
    const $ = loadHtml(html);

    $("a[href*='/job/']").each((index, element) => {
      const link = $(element);
      const href = link.attr("href");
      const title = text(link);
      if (!href || !title || title.length < 4) return;

      const url = absoluteUrl(href, baseUrl);
      const container = link.closest("li, article, tr, div");
      const containerText = text(container);

      jobs.push({
        job_id: buildJobId(source, url, String(index)),
        source,
        title,
        employer: container.find(".employer, .trust, .organisation, .organization").first().text().trim() || undefined,
        location: container.find(".location").first().text().trim() || undefined,
        salary: /Salary:\s*([^]*?)(?=Closing|Location|$)/i.exec(containerText)?.[1]?.trim(),
        url,
        raw: { searchUrl, keyword }
      });
    });
    } catch (error) {
      failures.push(`${keyword}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length > 0) {
    const error = new Error(`Some NHSJobs.com keyword searches failed. ${failures.join(" | ")}`);
    if (/status 403|status 429|forbidden|too many requests/i.test(error.message)) {
      logBlockedSourceFallback(source, error);
    } else {
      logScraperFailure(source, error);
    }
  }

  return filterMatchingJobs(uniqueJobs(jobs), config.searchKeywords);
}
