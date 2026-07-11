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

const source = "nhsjobs-com" as const;
const baseUrl = "https://www.nhsjobs.com";

function buildSearchUrl(): string {
  const url = new URL("/search", baseUrl);
  url.searchParams.set("q", config.searchKeyword);
  return url.toString();
}

export async function scrapeNhsJobsCom(): Promise<NormalizedJob[]> {
  try {
    const searchUrl = buildSearchUrl();
    const $ = loadHtml(await fetchHtml(searchUrl));
    const jobs: NormalizedJob[] = [];

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
        raw: { searchUrl }
      });
    });

    return filterMatchingJobs(jobs, config.searchKeyword);
  } catch (error) {
    logScraperFailure(source, error);
    return [];
  }
}
