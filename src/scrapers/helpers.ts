import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { request } from "undici";
import { logger } from "../utils/logger.js";
import type { JobSource, NormalizedJob } from "./types.js";

const userAgent =
  "Mozilla/5.0 (compatible; NHSJobAlertsBot/0.1; +https://example.local)";

export async function fetchHtml(url: string): Promise<string> {
  const response = await request(url, {
    method: "GET",
    headers: {
      "user-agent": userAgent,
      accept: "text/html,application/xhtml+xml"
    },
    bodyTimeout: 30000,
    headersTimeout: 30000
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`GET ${url} failed with status ${response.statusCode}`);
  }

  return response.body.text();
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

export function buildJobId(source: JobSource, url: string, fallback: string): string {
  const parsed = new URL(url);
  const pathParts = parsed.pathname.split("/").filter(Boolean);
  const lastPart = pathParts[pathParts.length - 1] || fallback;
  const safeId = decodeURIComponent(lastPart).replace(/[^a-zA-Z0-9_.:-]+/g, "-");
  return `${source}:${safeId || fallback}`;
}

export function filterMatchingJobs(
  jobs: NormalizedJob[],
  keyword: string
): NormalizedJob[] {
  const terms = [keyword, "junior clinical fellow", "clinical fellow", "jcf"]
    .map((term) => term.toLowerCase())
    .filter(Boolean);

  return jobs.filter((job) => {
    const haystack = `${job.title} ${job.employer ?? ""}`.toLowerCase();
    return terms.some((term) => haystack.includes(term));
  });
}

export function logScraperFailure(source: JobSource, error: unknown): void {
  logger.error({ source, error }, "scraper failed");
}

export function uniqueJobs(jobs: NormalizedJob[]): NormalizedJob[] {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    if (seen.has(job.job_id)) return false;
    seen.add(job.job_id);
    return true;
  });
}
