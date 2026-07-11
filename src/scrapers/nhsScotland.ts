import { config } from "../config.js";
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

const source = "nhs-scotland" as const;
const baseUrl = "https://apply.jobs.scot.nhs.uk";

function buildSearchUrl(): string {
  const url = new URL("/Home/Job", baseUrl);
  url.searchParams.set("keywords", config.searchKeyword);
  return url.toString();
}

export async function scrapeNhsScotland(): Promise<NormalizedJob[]> {
  try {
    const searchUrl = buildSearchUrl();
    const $ = loadHtml(await fetchHtml(searchUrl));
    const jobs: NormalizedJob[] = [];

    $("a[href*='/Job/'], a[href*='JobId='], a[href*='jobId=']").each((index, element) => {
      const link = $(element);
      const href = link.attr("href");
      const title = text(link);
      if (!href || !title || title.length < 4) return;

      const url = absoluteUrl(href, baseUrl);
      const parsed = new URL(url);
      const queryId = parsed.searchParams.get("JobId") ?? parsed.searchParams.get("jobId");
      const container = link.closest("li, article, tr, div");
      const containerText = text(container);

      jobs.push({
        job_id: queryId ? `${source}:${queryId}` : buildJobId(source, url, String(index)),
        source,
        title,
        employer: container.find(".employer, .organisation, .organization, .board").first().text().trim() || undefined,
        location: container.find(".location, .region").first().text().trim() || undefined,
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
