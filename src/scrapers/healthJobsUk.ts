import { config } from "../config.js";
import {
  absoluteUrl,
  buildJobId,
  fetchFirstHtml,
  filterMatchingJobs,
  loadHtml,
  logScraperFailure,
  text
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
  ];
}

export async function scrapeHealthJobsUk(): Promise<NormalizedJob[]> {
  try {
    const { html, url: searchUrl } = await fetchFirstHtml(buildSearchUrls(config.searchKeyword));
    const $ = loadHtml(html);
    const jobs: NormalizedJob[] = [];

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
        raw: { searchUrl }
      });
    });

    return filterMatchingJobs(jobs, config.searchKeyword);
  } catch (error) {
    logScraperFailure(source, error);
    return [];
  }
}
