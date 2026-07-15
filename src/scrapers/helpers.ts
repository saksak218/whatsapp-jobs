import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { request } from "undici";
import { config } from "../config.js";
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
    bodyTimeout: config.httpTimeoutMs,
    headersTimeout: config.httpTimeoutMs,
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

export async function fetchRenderedMarkdown(url: string): Promise<string> {
  const target = new URL(url);
  const renderedUrl = `https://r.jina.ai/http://${target.host}${target.pathname}${target.search}${target.hash}`;
  return fetchHtml(renderedUrl);
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanMarkdownTitle(value: string): string {
  return value
    .replace(/^\s*\d+\.\s+\[/, "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseRenderedTracJobsMarkdown(
  markdown: string,
  source: JobSource,
  baseUrl: string,
  searchUrl: string,
  keyword: string,
): NormalizedJob[] {
  const jobs: NormalizedJob[] = [];
  const basePattern = escapeRegExp(baseUrl);
  const linkPattern = new RegExp(`\\]\\((${basePattern}/job/[^\\s)]+)(?:\\s+"([^"]+)")?\\)`, "g");

  for (const line of markdown.split("\n")) {
    if (!line.includes(`${baseUrl}/job/`)) continue;

    linkPattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = linkPattern.exec(line)) !== null) {
      const url = match[1];
      if (!url) continue;

      const titleFromAttribute = match[2]?.trim();
      const titleFromText = cleanMarkdownTitle(line.slice(0, match.index));
      const title = titleFromAttribute || titleFromText;
      if (!title || title.length < 4) continue;

      const visibleText = cleanMarkdownTitle(line);
      const salary = /Salary:\s*([^]*?)(?=\]\(|$)/i.exec(visibleText)?.[1]?.trim();
      const location = /,\s*([^,]+?)\s+Speciality:/i.exec(visibleText)?.[1]?.trim();

      jobs.push({
        job_id: buildJobId(source, url, String(jobs.length)),
        source,
        title,
        location,
        salary,
        url,
        raw: {
          searchUrl,
          keyword,
          fallback: "r.jina.ai rendered markdown",
        },
      });
    }
  }

  return jobs;
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const defaultMatchPatterns = [
  /\bclinical\s+fellow\b/i,
  /\bclinical\s+fellowship\b/i,
  /\bclinical\s+dev(?:elopment)?\s+fellow\b/i,
  /\bjunior\s+clinical\s+fellow\b/i,
  /\bclinical\s+research\s+fellow\b/i,
  /\bteaching\s+fellow\b/i,
  /\bfoundation\s+(?:house\s+officer|doctor|year)\s*(?:1|one|i)\b/i,
  /\bfoundation\s+(?:house\s+officer|doctor|year)\s*(?:2|two|ii)\b/i,
  /\blas\s*-\s*fy\s*1\b/i,
  /\blas\s*-\s*fy\s*2\b/i,
  /\b(?:fho|fy|f)\s*1\b/i,
  /\b(?:fho|fy|f)\s*2\b/i,
  /\bcore\s+trainee\b/i,
  /\blas\s*-\s*core\s+trainee\b/i,
  /\blat\s*-\s*core\s+trainee\b/i,
  /\bct\s*1\b/i,
  /\bct\s*2\b/i,
  /\bct\s*1\s*(?:\/|-|and|&)\s*2\b/i,
];

const blockedLocationPatterns = [
  /\bjersey\b/i,
  /\bguernsey\b/i,
  /\bisle\s+of\s+man\b/i,
  /\brepublic\s+of\s+ireland\b/i,
  /\bdublin\b/i,
];

export function isExcludedSeniorRole(job: NormalizedJob): boolean {
  const title = job.title.toLowerCase();
  return (
    (/\bsenior\b/i.test(title) && /\bfellow\b/i.test(title)) ||
    /\bsenior\s+clinical\s+fellow\b/i.test(title) ||
    /\bsnr\.?\s+clinical\s+fellow\b/i.test(title) ||
    /\bspec\s*reg\b/i.test(title) ||
    /\bpost\s*-?\s*cct\b/i.test(title) ||
    /\bst\s*[3-8]\+?\b/i.test(title)
  );
}

export function getMatchingKeywords(
  job: NormalizedJob,
  keywords: readonly string[],
): string[] {
  if (isExcludedSeniorRole(job)) return [];

  const searchableText = `${job.title} ${job.employer ?? ""} ${job.salary ?? ""}`;
  const haystack = normalizeForMatch(searchableText);
  const configuredMatches = keywords.filter((keyword) => {
    const term = normalizeForMatch(keyword);
    return term.length > 0 && haystack.includes(term);
  });

  if (configuredMatches.length > 0) return configuredMatches;

  return defaultMatchPatterns.some((pattern) => pattern.test(searchableText))
    ? ["configured keyword variant"]
    : [];
}

export function filterMatchingJobs(
  jobs: NormalizedJob[],
  keywords: readonly string[],
): NormalizedJob[] {
  return jobs.filter((job) => getMatchingKeywords(job, keywords).length > 0);
}

export function isAllowedUkLocation(job: NormalizedJob): boolean {
  const searchableText = `${job.location ?? ""} ${job.url}`;
  return !blockedLocationPatterns.some((pattern) => pattern.test(searchableText));
}

export function filterAllowedLocations(jobs: NormalizedJob[]): NormalizedJob[] {
  return jobs.filter(isAllowedUkLocation);
}

export function logScraperFailure(source: JobSource, error: unknown): void {
  logger.error({ source, err: error instanceof Error ? error : new Error(String(error)) }, "scraper failed");
}

export function logBlockedSourceFallback(source: JobSource, error: unknown): void {
  logger.warn(
    {
      source,
      err: error instanceof Error ? error : new Error(String(error)),
      fallback:
        "direct HTTP was blocked; use free-first alternatives: browser-mode scraping, public job-alert email ingestion, or mirrored trust/NHS Jobs listings",
    },
    "source appears to block direct HTTP scraping",
  );
}

export function uniqueJobs(jobs: NormalizedJob[]): NormalizedJob[] {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    if (seen.has(job.job_id)) return false;
    seen.add(job.job_id);
    return true;
  });
}

function canonicalJobKey(job: NormalizedJob): string {
  try {
    const parsed = new URL(job.url);
    const host = parsed.hostname.replace(/^www\./, "");
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1];

    if (
      (host === "healthjobsuk.com" || host === "nhsjobs.com") &&
      pathParts[0]?.toLowerCase() === "job" &&
      lastPart
    ) {
      return `trac:${lastPart.toLowerCase()}`;
    }
  } catch {
    return job.job_id;
  }

  return job.job_id;
}

export function uniqueJobsAcrossSources(jobs: NormalizedJob[]): NormalizedJob[] {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    const key = canonicalJobKey(job);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
