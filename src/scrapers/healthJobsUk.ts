import { config } from "../config.js";
import { fetchBrowserHtml } from "./browserFetch.js";
import {
  absoluteUrl,
  buildJobId,
  fetchFirstHtml,
  fetchRenderedMarkdown,
  filterAllowedLocations,
  filterMatchingJobs,
  getSearchKeywordsForSource,
  loadHtml,
  logBlockedSourceFallback,
  logScraperFailure,
  parseRenderedTracJobsMarkdown,
  text,
  uniqueJobs
} from "./helpers.js";
import type { NormalizedJob } from "./types.js";

const source = "healthjobsuk" as const;
const baseUrl = "https://www.healthjobsuk.com";

function buildMainSearchUrl(keyword: string): string {
  const url = new URL("/job_list", baseUrl);
  url.searchParams.set("JobSearch_q", keyword);
  url.searchParams.set("JobSearch_d", "");
  url.searchParams.set("JobSearch_g", "255");
  url.searchParams.set("JobSearch_re", "*POST");
  url.searchParams.set("JobSearch_re_0", "1");
  url.searchParams.set("JobSearch_Submit", "Search");
  url.searchParams.set("_tr", "JobSearch");
  return url.toString();
}

function buildSearchUrls(keyword: string): string[] {
  const simpleSearch = new URL("/job_list", baseUrl);
  simpleSearch.searchParams.set("JobSearch_q", keyword);
  simpleSearch.searchParams.set("JobSearch_Submit", "Search");
  simpleSearch.searchParams.set("_tr", "JobSearch");

  const legacySearch = new URL("/job_list", baseUrl);
  legacySearch.searchParams.set("q", keyword);

  return [
    buildMainSearchUrl(keyword),
    simpleSearch.toString(),
    legacySearch.toString(),
    baseUrl,
  ];
}

async function scrapeRenderedFallback(keyword: string): Promise<NormalizedJob[]> {
  const searchUrl = buildMainSearchUrl(keyword);
  const markdown = await fetchRenderedMarkdown(searchUrl);
  return parseRenderedTracJobsMarkdown(markdown, source, baseUrl, searchUrl, keyword);
}

async function scrapeBrowserFallback(keyword: string): Promise<NormalizedJob[]> {
  const searchUrl = buildMainSearchUrl(keyword);
  const html = await fetchBrowserHtml(searchUrl);
  return parseHtmlJobs(html, searchUrl, keyword);
}

function parseHtmlJobs(html: string, searchUrl: string, keyword: string): NormalizedJob[] {
  const jobs: NormalizedJob[] = [];
  const $ = loadHtml(html);

  $("a[href*='/job/'], a[href*='job_id='], a[href*='/vacancy/']").each((index, element) => {
    const link = $(element);
    const href = link.attr("href");
    const title = text(link);
    if (!href || !title || title.length < 4) return;

    const url = absoluteUrl(href, baseUrl);
    const container = link.closest("li, article, tr, div");
    const containerText = text(container);
    const jobIdFromQuery = new URL(url).searchParams.get("job_id");

    jobs.push({
      job_id: jobIdFromQuery ? `${source}:${jobIdFromQuery}` : buildJobId(source, url, String(index)),
      source,
      title,
      employer: container.find(".employer, .organisation, .organization").first().text().trim() || undefined,
      location: container.find(".location").first().text().trim() || undefined,
      salary: /Salary:\s*([^]*?)(?=Closing|Location|$)/i.exec(containerText)?.[1]?.trim(),
      url,
      raw: { searchUrl, keyword },
    });
  });

  return jobs;
}

export async function scrapeHealthJobsUk(): Promise<NormalizedJob[]> {
  const jobs: NormalizedJob[] = [];
  const failures: string[] = [];
  const browserFailures: string[] = [];
  const fallbackFailures: string[] = [];
  const searchKeywords = getSearchKeywordsForSource(source);

  for (const keyword of searchKeywords) {
    try {
      const { html, url: searchUrl } = await fetchFirstHtml(buildSearchUrls(keyword));
      jobs.push(...parseHtmlJobs(html, searchUrl, keyword));
    } catch (error) {
      failures.push(`${keyword}: ${error instanceof Error ? error.message : String(error)}`);

      try {
        jobs.push(...await scrapeRenderedFallback(keyword));
      } catch (fallbackError) {
        fallbackFailures.push(`${keyword}: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);

        try {
          jobs.push(...await scrapeBrowserFallback(keyword));
        } catch (browserError) {
          browserFailures.push(`${keyword}: ${browserError instanceof Error ? browserError.message : String(browserError)}`);
        }
      }
    }
  }

  if (failures.length > 0) {
    const error = new Error(`Some HealthJobsUK keyword searches failed. ${failures.join(" | ")}`);
    if (/status 403|status 429|forbidden|too many requests/i.test(error.message)) {
      logBlockedSourceFallback(source, error);
    } else {
      logScraperFailure(source, error);
    }
  }

  if (browserFailures.length > 0) {
    logScraperFailure(source, new Error(`Some HealthJobsUK browser fallback searches failed. ${browserFailures.join(" | ")}`));
  }

  if (fallbackFailures.length > 0) {
    logScraperFailure(source, new Error(`Some HealthJobsUK rendered fallback searches failed. ${fallbackFailures.join(" | ")}`));
  }

  return filterAllowedLocations(filterMatchingJobs(uniqueJobs(jobs), searchKeywords));
}
