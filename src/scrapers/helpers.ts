import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { request } from "undici";
import { logger } from "../utils/logger.js";
import type { JobSource, NormalizedJob } from "./types.js";

const userAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchWithUndici(url: string): Promise<string> {
  const response = await request(url, {
    method: "GET",
    headers: {
      "user-agent": userAgent,
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      pragma: "no-cache",
      upgradeInsecureRequests: "1",
    },
    bodyTimeout: 60000,
    headersTimeout: 60000,
  });

  if (response.statusCode === 403 || response.statusCode === 429) {
    throw new Error(`GET ${url} failed with status ${response.statusCode}`);
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`GET ${url} failed with status ${response.statusCode}`);
  }

  return response.body.text();
}

export async function fetchHtml(url: string): Promise<string> {
  try {
    return await fetchWithUndici(url);
  } catch (error) {
    const fallbackUrl = new URL(url);
    fallbackUrl.searchParams.set("utm_source", "nhs-jobs-alerts");

    try {
      return await fetchWithUndici(fallbackUrl.toString());
    } catch (fallbackError) {
      throw fallbackError;
    }
  }
}

export async function fetchFirstHtml(
  urls: string[],
): Promise<{ html: string; url: string }> {
  const failures: string[] = [];

  for (const url of urls) {
    try {
      return { html: await fetchHtml(url), url };
    } catch (error) {
      failures.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`All search URLs failed. ${failures.join(" | ")}`);
}

export function loadHtml(html: string): cheerio.CheerioAPI {
  return cheerio.load(html);
}

export function absoluteUrl(href: string, baseUrl: string): string {
  return new URL(href, baseUrl).toString();
}

export function text(value: cheerio.Cheerio<AnyNode>): string {
  return value.text().replace(/\s+/g, " ").trim();
}

export function buildJobId(
  source: JobSource,
  url: string,
  fallback: string,
): string {
  const parsed = new URL(url);
  const pathParts = parsed.pathname.split("/").filter(Boolean);
  const lastPart = pathParts[pathParts.length - 1] || fallback;
  const safeId = decodeURIComponent(lastPart).replace(
    /[^a-zA-Z0-9_.:-]+/g,
    "-",
  );
  return `${source}:${safeId || fallback}`;
}

export function filterMatchingJobs(
  jobs: NormalizedJob[],
  keyword: string,
): NormalizedJob[] {
  const terms = [keyword, "junior clinical fellow", "clinical fellow", "fellow", "jcf"]
    .map((term) => term.toLowerCase())
    .filter(Boolean);

  return jobs.filter((job) => {
    const haystack = `${job.title} ${job.employer ?? ""}`.toLowerCase();
    return terms.some((term) => haystack.includes(term));
  });
}

export function logScraperFailure(source: JobSource, error: unknown): void {
  logger.error({ source, err: error instanceof Error ? error : new Error(String(error)) }, "scraper failed");
}

export function uniqueJobs(jobs: NormalizedJob[]): NormalizedJob[] {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    if (seen.has(job.job_id)) return false;
    seen.add(job.job_id);
    return true;
  });
}
