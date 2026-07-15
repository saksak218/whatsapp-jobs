import { config } from "../config.js";
import { fetchBrowserHtml } from "./browserFetch.js";
import {
  absoluteUrl,
  buildJobId,
  fetchFirstHtml,
  fetchRenderedMarkdown,
  filterAllowedLocations,
  filterMatchingJobs,
  loadHtml,
  logBlockedSourceFallback,
  logScraperFailure,
  parseRenderedTracJobsMarkdown,
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
  const tracStyleUrl = new URL("/job_list", baseUrl);
  tracStyleUrl.searchParams.set("JobSearch_q", keyword);
  tracStyleUrl.searchParams.set("JobSearch_Submit", "Search");
  tracStyleUrl.searchParams.set("_tr", "JobSearch");

  const url = new URL("/search", baseUrl);
  url.searchParams.set("q", keyword);

  const keywordUrl = new URL("/search", baseUrl);
  keywordUrl.searchParams.set("keywords", keyword);

  return [
    tracStyleUrl.toString(),
    url.toString(),
    keywordUrl.toString(),
    new URL(`/search-jobs/${slugifyKeyword(keyword)}`, baseUrl).toString(),
    baseUrl,
  ];
}

async function scrapeRenderedFallback(keyword: string): Promise<NormalizedJob[]> {
  const searchUrl = buildSearchUrls(keyword)[0] ?? baseUrl;
  const markdown = await fetchRenderedMarkdown(searchUrl);
  return parseRenderedTracJobsMarkdown(markdown, source, baseUrl, searchUrl, keyword);
}

async function scrapeBrowserFallback(keyword: string): Promise<NormalizedJob[]> {
  const searchUrl = buildSearchUrls(keyword)[0] ?? baseUrl;
  const html = await fetchBrowserHtml(searchUrl);
  return parseHtmlJobs(html, searchUrl, keyword);
}

function parseHtmlJobs(html: string, searchUrl: string, keyword: string): NormalizedJob[] {
  const jobs: NormalizedJob[] = [];
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
      raw: { searchUrl, keyword },
    });
  });

  return jobs;
}

export async function scrapeNhsJobsCom(): Promise<NormalizedJob[]> {
  const jobs: NormalizedJob[] = [];
  const failures: string[] = [];
  const browserFailures: string[] = [];
  const fallbackFailures: string[] = [];

  for (const keyword of config.searchKeywords) {
    try {
      const { html, url: searchUrl } = await fetchFirstHtml(buildSearchUrls(keyword));
      jobs.push(...parseHtmlJobs(html, searchUrl, keyword));
    } catch (error) {
      failures.push(`${keyword}: ${error instanceof Error ? error.message : String(error)}`);

      try {
        jobs.push(...await scrapeBrowserFallback(keyword));
      } catch (browserError) {
        browserFailures.push(`${keyword}: ${browserError instanceof Error ? browserError.message : String(browserError)}`);

        try {
          jobs.push(...await scrapeRenderedFallback(keyword));
        } catch (fallbackError) {
          fallbackFailures.push(`${keyword}: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
        }
      }
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

  if (browserFailures.length > 0) {
    logScraperFailure(source, new Error(`Some NHSJobs.com browser fallback searches failed. ${browserFailures.join(" | ")}`));
  }

  if (fallbackFailures.length > 0) {
    logScraperFailure(source, new Error(`Some NHSJobs.com rendered fallback searches failed. ${fallbackFailures.join(" | ")}`));
  }

  return filterAllowedLocations(filterMatchingJobs(uniqueJobs(jobs), config.searchKeywords));
}
