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
  uniqueJobs,
} from "./helpers.js";
import type { NormalizedJob } from "./types.js";

const source = "hscni" as const;
const baseUrl = "https://jobs.hscni.net";

function buildSearchUrl(keyword: string): string {
  const url = new URL("/Search", baseUrl);
  url.searchParams.set("SearchCatID", "63");
  url.searchParams.set("keyword", keyword);
  return url.toString();
}

function buildCategoryUrl(): string {
  const url = new URL("/Search", baseUrl);
  url.searchParams.set("SearchCatID", "63");
  return url.toString();
}

function overviewValue(containerText: string, label: string): string | undefined {
  const match = new RegExp(`${label}:\\s*([^]*?)(?=Salary:|Location:|Contract Type:|$)`, "i").exec(containerText);
  return match?.[1]?.trim();
}

function parseHscniPage(html: string, searchUrl: string, keyword: string): NormalizedJob[] {
  const $ = loadHtml(html);
  const jobs: NormalizedJob[] = [];

  $("article.job-result").each((index, element) => {
    const card = $(element);
    const link = card.find("h2 a[href*='/Job/']").first();
    const href = link.attr("href");
    const title = text(link);
    if (!href || !title || title.length < 4) return;

    const url = absoluteUrl(href, baseUrl);
    const jobIdFromPath = /\/Job\/([^/?#]+)/i.exec(url)?.[1];
    const overviewText = text(card.find(".job-result-overview"));
    const closingText = text(card.find(".job-closing")).replace(/^Closing:\s*/i, "").trim();
    const reference = text(card.find(".job-ref")).replace(/^Ref:\s*/i, "").trim() || undefined;
    const contractType = overviewValue(overviewText, "Contract Type");

    jobs.push({
      job_id: jobIdFromPath ? `${source}:${jobIdFromPath}` : buildJobId(source, url, String(index)),
      source,
      title,
      location: overviewValue(overviewText, "Location"),
      salary: overviewValue(overviewText, "Salary"),
      url,
      closing_at: parseUkDate(closingText),
      raw: {
        searchUrl,
        keyword,
        reference,
        contractType,
      },
    });
  });

  return jobs;
}

export async function scrapeHscni(): Promise<NormalizedJob[]> {
  const jobs: NormalizedJob[] = [];
  const failures: string[] = [];
  const categoryUrl = buildCategoryUrl();

  try {
    jobs.push(...parseHscniPage(await fetchHtml(categoryUrl), categoryUrl, "Medical & Dental category"));
  } catch (error) {
    failures.push(`Medical & Dental category: ${error instanceof Error ? error.message : String(error)}`);
  }

  for (const keyword of config.searchKeywords) {
    const searchUrl = buildSearchUrl(keyword);

    try {
      jobs.push(...parseHscniPage(await fetchHtml(searchUrl), searchUrl, keyword));
    } catch (error) {
      failures.push(`${keyword}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length > 0) {
    logScraperFailure(source, new Error(`Some HSCNI keyword searches failed. ${failures.join(" | ")}`));
  }

  return filterMatchingJobs(uniqueJobs(jobs), config.searchKeywords);
}
