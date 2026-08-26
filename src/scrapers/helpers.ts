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
  const response = await fetch(renderedUrl, {
    headers: {
      accept: "text/markdown,text/plain;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(config.httpTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`GET ${renderedUrl} failed with status ${response.status}`);
  }

  return response.text();
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
  const baseHostPattern = escapeRegExp(new URL(baseUrl).host);
  const linkPattern = new RegExp(
    `\\]\\((https?://${baseHostPattern}/job/[^\\s)]+)(?:\\s+"([^"]+)")?\\)`,
    "g",
  );

  for (const line of markdown.split("\n")) {
    if (!line.includes("/job/")) continue;

    linkPattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = linkPattern.exec(line)) !== null) {
      const matchedUrl = match[1];
      if (!matchedUrl) continue;
      const parsedUrl = new URL(matchedUrl);
      parsedUrl.protocol = "https:";
      const url = parsedUrl.toString();

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

interface LabeledPattern {
  label: string;
  pattern: RegExp;
}

const explicitJuniorTitlePatterns: LabeledPattern[] = [
  { label: "junior doctor", pattern: /\bjunior\s+(?:clinical\s+fellow|doctor|grade\s+doctor)\b/i },
  { label: "foundation grade", pattern: /\b(?:foundation(?:\s+(?:year|doctor|house\s+officer))?\s*(?:1|2|one|two)|fho\s*[12]|fy\s*[1-4]|f\s*[1-4])\b/i },
  { label: "SHO grade", pattern: /\b(?:sho|senior\s+house\s+officer)\b/i },
  { label: "early specialty grade", pattern: /\b(?:st|ct|imt|cst)\s*(?:1|2)\b/i },
  { label: "core trainee", pattern: /\bcore\s+(?:surgical\s+)?trainee\b/i },
  { label: "entry training programme", pattern: /\b(?:accs|gpst\s*1|gp\s+specialty\s+trainee)\b/i },
  { label: "junior LAS/LAT", pattern: /\b(?:las|lat)\s*-?\s*(?:(?:fy|f|ct|st)\s*)?[12]\b/i },
  { label: "tier 1 doctor", pattern: /\btier\s*1\b/i },
  { label: "simulation fellow", pattern: /\bsimulation\s+fellow\b/i },
  { label: "education fellow", pattern: /\b(?:clinical\s+)?(?:teaching|education|development)\s+fellow\b/i },
  { label: "academic clinical fellow", pattern: /\bacademic\s+clinical\s+fellow\b/i },
];

const ambiguousJuniorTitlePatterns: LabeledPattern[] = [
  { label: "resident doctor", pattern: /\bresident\s+(?:medical\s+)?doctor\b/i },
  { label: "resident medical officer", pattern: /\b(?:resident\s+medical\s+officer|rmo)\b/i },
  { label: "trust doctor", pattern: /\btrust\s+(?:grade\s+)?doctor\b/i },
  { label: "trust grade", pattern: /\btrust\s+grade\b/i },
  { label: "locally employed doctor", pattern: /\b(?:locally\s+employed(?:\s+resident)?\s+doctor|led)\b/i },
  { label: "clinical fellow", pattern: /\bclinical\s+(?:research\s+)?fellow(?:ship)?\b/i },
  { label: "research fellow", pattern: /\bresearch\s+fellow\b/i },
  { label: "ward doctor", pattern: /\bward\s+doctor\b/i },
];

const entryLevelTitlePatterns = [
  /\b(?:foundation(?:\s+(?:year|doctor|house\s+officer))?\s*(?:1|2|one|two)|fho\s*[12]|fy\s*[1-4]|f\s*[1-4])\b/i,
  /\b(?:sho|senior\s+house\s+officer)\b/i,
  /\b(?:st|ct|imt|cst)\s*(?:1|2)\b/i,
  /\bcore\s+(?:surgical\s+)?trainee\b/i,
  /\b(?:accs|gpst\s*1|gp\s+specialty\s+trainee)\b/i,
  /\b(?:las|lat)\s*-?\s*(?:(?:fy|f|ct|st)\s*)?[12]\b/i,
  /\btier\s*1\b/i,
];

const absoluteSeniorTitlePatterns = [
  /\b(?:locum\s+)?consultant\b/i,
  /\bpost\s*-?\s*(?:cct|ccst|cesr)\b/i,
  /\b(?:specialty|speciality|specialist)\s+doctor\b/i,
  /\bassociate\s+specialist\b/i,
  /\bstaff\s+grade\b/i,
  /\b(?:medical\s+director|chief\s+medical\s+officer)\b/i,
  /\btraining\s+programme\s+director\b/i,
  /\b(?:salaried\s+)?general\s+practitioner\b/i,
  /\bsalaried\s+gp\b/i,
];

const seniorTitlePatterns = [
  /\bsenior\b/i,
  /\b(?:middle|higher)\s+grade\b/i,
  /\btrust\s+registrar\b/i,
  /\b(?:specialty|specialist)\s+registrar\b/i,
  /\bspec\s*reg\b/i,
  /\bspr\b/i,
  /\bregistrar\b/i,
  /\b(?:st|ct|imt|cst)\s*(?:[3-9]|1\d)\+?\b/i,
  /\b(?:mt\s*0?[4-9]|nodal\s+point\s+(?:[4-9]|1\d))\b/i,
  /\btier\s*2\b/i,
];

const strongJuniorEligibilityPatterns = [
  /\b(?:post|role|position|job)\b[^.]{0,140}\b(?:suitable|aimed|available)\b[^.]{0,140}\b(?:fy|f|st|ct|imt|cst)\s*(?:1|2)\b/i,
  /\b(?:applicants?|candidates?)\b[^.]{0,180}\b(?:fy|f|st|ct|imt|cst)\s*(?:1|2)\b/i,
  /\b(?:at|equivalent\s+to)\s+(?:fy|f|st|ct|imt|cst)\s*(?:1|2)\s+(?:equivalent\s+)?level\b/i,
  /\bsatisfactory\s+completion\b[^.]{0,180}\bfoundation\s+year\s*(?:1|2)\b/i,
  /\bcompletion\s+of\s+(?:the\s+)?foundation\s+programme\b/i,
  /\bminimum\s+of\s+(?:one|two|1|2)\s+years?[^.]{0,120}\b(?:internship|fy\s*1|foundation\s+year\s*1)\b/i,
];

const seniorOnlyEligibilityPatterns = [
  /\b(?:post|role|position|job)\b[^.]{0,140}\b(?:suitable|aimed|available)\b[^.]{0,140}\b(?:st|ct|imt|cst)\s*(?:[3-9]|1\d)\+?\b/i,
  /\b(?:st|ct|imt|cst)\s*(?:[3-9]|1\d)\+?\s*(?:equivalent|level)\b/i,
  /\b(?:applicants?|candidates?)\b[^.]{0,180}\bcompleted?\s+(?:core|internal\s+medicine)\s+training\b/i,
];

const blockedLocationPatterns = [
  /\bjersey\b/i,
  /\bguernsey\b/i,
  /\bisle\s+of\s+man\b/i,
  /\brepublic\s+of\s+ireland\b/i,
  /\bdublin\b/i,
];

function isPlainClinicalFellowRestrictedBySource(job: NormalizedJob): boolean {
  if (job.source === "nhs-scotland") return false;

  const hasEntryGrade = entryLevelTitlePatterns.some((pattern) =>
    pattern.test(job.title),
  );
  const hasSeniorGrade = seniorTitlePatterns.some((pattern) =>
    pattern.test(job.title),
  );
  return (
    /\bclinical\s+fellow(?:ship)?\b/i.test(job.title) &&
    !/\bjunior\s+clinical\s+fellow(?:ship)?\b/i.test(job.title) &&
    !(hasEntryGrade && !hasSeniorGrade)
  );
}

export function isExcludedSeniorRole(job: NormalizedJob): boolean {
  const title = job.title.replace(/\bsenior\s+house\s+officer\b/gi, "SHO");
  if (absoluteSeniorTitlePatterns.some((pattern) => pattern.test(title))) return true;

  const hasEntryLevelTitle = entryLevelTitlePatterns.some((pattern) => pattern.test(title));
  if (
    !hasEntryLevelTitle &&
    seniorTitlePatterns.some((pattern) => pattern.test(title))
  ) {
    return true;
  }

  const hasExplicitJuniorTitle = explicitJuniorTitlePatterns.some(({ pattern }) =>
    pattern.test(title),
  );
  if (hasExplicitJuniorTitle) return false;

  const details = job.classification_text ?? "";
  const hasStrongJuniorEligibility = strongJuniorEligibilityPatterns.some((pattern) =>
    pattern.test(details),
  );
  return (
    !hasStrongJuniorEligibility &&
    seniorOnlyEligibilityPatterns.some((pattern) => pattern.test(details))
  );
}

export function getSearchKeywordsForSource(
  source: JobSource,
): readonly string[] {
  if (source === "hscni") return [];

  const coreKeywords = [
    "Resident Doctor",
    "Trust Doctor",
    "Trust Grade",
    "Locally Employed Doctor",
    "Medical Officer",
    "Fellow",
    "Foundation Doctor",
    "FY2",
    "SHO",
    "Core Trainee",
    "ST1",
    "LAS",
  ];

  if (source !== "healthjobsuk") return coreKeywords;

  return [
    ...coreKeywords,
    "RMO",
    "FY1",
    "FY3",
    "ST2",
    "CT1",
    "CT2",
    "IMT1",
    "IMT2",
    "CST1",
    "CST2",
    "LAT",
    "Tier 1",
  ];
}

export function isPotentialJuniorJob(job: NormalizedJob): boolean {
  if (isExcludedSeniorRole(job)) return false;

  const title = job.title;
  return (
    explicitJuniorTitlePatterns.some(({ pattern }) => pattern.test(title)) ||
    ambiguousJuniorTitlePatterns.some(({ pattern }) => pattern.test(title)) ||
    /\b(?:doctor|fellow|medical\s+officer)\b/i.test(title)
  );
}

export function getMatchingKeywords(
  job: NormalizedJob,
  keywords: readonly string[],
): string[] {
  if (isPlainClinicalFellowRestrictedBySource(job)) return [];
  if (!isPotentialJuniorJob(job)) return [];

  const configuredText = `${job.title} ${job.employer ?? ""} ${job.salary ?? ""}`;
  const haystack = normalizeForMatch(configuredText);
  const paddedHaystack = ` ${haystack} `;
  const configuredMatches = keywords.filter((keyword) => {
    const term = normalizeForMatch(keyword);
    return term.length > 0 && paddedHaystack.includes(` ${term} `);
  });

  if (configuredMatches.length > 0) return configuredMatches;

  const explicitTitleMatch = explicitJuniorTitlePatterns.find(({ pattern }) =>
    pattern.test(job.title),
  );
  if (explicitTitleMatch) return [explicitTitleMatch.label];

  const strongEligibilityMatch = strongJuniorEligibilityPatterns.find((pattern) =>
    pattern.test(job.classification_text ?? ""),
  );
  if (strongEligibilityMatch && isPotentialJuniorJob(job)) {
    return ["junior eligibility in advert details"];
  }

  const ambiguousTitleMatch = ambiguousJuniorTitlePatterns.find(({ pattern }) =>
    pattern.test(job.title),
  );
  return ambiguousTitleMatch ? [ambiguousTitleMatch.label] : [];
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
