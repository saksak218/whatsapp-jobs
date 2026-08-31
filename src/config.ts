import "dotenv/config";

const trueValues = new Set(["1", "true", "yes", "on"]);

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

function envInt(name: string, fallback: number): number {
  const raw = env(name);
  if (!raw) return fallback;

  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return value;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = env(name);
  return raw ? trueValues.has(raw.toLowerCase()) : fallback;
}

function envDate(name: string): Date | undefined {
  const raw = env(name);
  if (!raw) return undefined;

  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) {
    throw new Error(`${name} must be a valid ISO-8601 date`);
  }

  return value;
}

function envList(name: string, fallback: string[]): string[] {
  const raw = env(name);
  if (!raw) return fallback;

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

const defaultSearchKeywords = [
  "Resident Doctor",
  "Trust Doctor",
  "Trust Grade Doctor",
  "Locally Employed Doctor",
  "Junior Clinical Fellow",
  "Clinical Fellow",
  "Clinical Research Fellow",
  "Clinical Teaching Fellow",
  "Clinical Development Fellow",
  "Simulation Fellow",
  "Foundation Doctor",
  "Foundation Year 1",
  "Foundation Year 2",
  "FY3",
  "SHO",
  "Core Trainee",
  "ST1",
];

function mergedSearchKeywords(): string[] {
  const configured = envList("SEARCH_KEYWORDS", []);
  return [...new Set([...defaultSearchKeywords, ...configured])];
}

export const config = {
  isVercel: envBool("VERCEL", false),
  databaseUrl: env("DATABASE_URL"),
  whatsappGroupJid: env("WHATSAPP_GROUP_JID"),
  whatsappGroupName: env("WHATSAPP_GROUP_NAME"),
  whatsappAuthDir: env("WHATSAPP_AUTH_DIR", "auth_info"),
  whatsappSenderNumber: env("WHATSAPP_SENDER_NUMBER"),
  searchKeywords: mergedSearchKeywords(),
  dbConnectTimeoutSeconds: envInt("DB_CONNECT_TIMEOUT_SECONDS", 30),
  dbRetentionDays: envInt("DB_RETENTION_DAYS", 60),
  deliveryNotBefore: envDate("DELIVERY_NOT_BEFORE"),
  httpTimeoutMs: envInt("HTTP_TIMEOUT_MS", 30000),
  browserFallbackEnabled: envBool("ENABLE_BROWSER_FALLBACK", true),
  browserTimeoutMs: envInt("BROWSER_TIMEOUT_MS", 15000),
  browserProfileDir: env("BROWSER_PROFILE_DIR", ".cache/browser-profile"),
  jobsNhsUkMaxPages: envInt("JOBS_NHS_UK_MAX_PAGES", 20),
  hscniMaxPages: envInt("HSCNI_MAX_PAGES", 5),
  nhsScotlandMaxPages: envInt("NHS_SCOTLAND_MAX_PAGES", 8),
  scrapeIntervalCron: env("SCRAPE_INTERVAL_CRON", "*/2 * * * *"),
  logLevel: env("LOG_LEVEL", "info"),
  sendMinDelayMs: envInt("SEND_MIN_DELAY_MS", 3000),
  sendMaxDelayMs: envInt("SEND_MAX_DELAY_MS", 6000),
  dryRunSends: envBool("DRY_RUN_SENDS", false),
  disableWhatsAppSends: envBool(
    "DISABLE_WHATSAPP_SENDS",
    envBool("VERCEL", false),
  ),
  sources: {
    healthJobsUk: envBool("ENABLE_HEALTHJOBSUK", true),
    jobsNhsUk: envBool("ENABLE_JOBS_NHS_UK", true),
    nhsScotland: envBool("ENABLE_NHS_SCOTLAND", true),
    nhsJobsCom: envBool("ENABLE_NHSJOBS_COM", true),
    hscni: envBool("ENABLE_HSCNI", true),
  },
} as const;

export function requireDatabaseUrl(): string {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return config.databaseUrl;
}

export function requireWhatsAppGroupJid(): string {
  if (
    !config.whatsappGroupJid ||
    config.whatsappGroupJid.includes("xxxxxxxx")
  ) {
    throw new Error(
      "WHATSAPP_GROUP_JID is required unless DRY_RUN_SENDS=true or WHATSAPP_GROUP_NAME is configured",
    );
  }

  return config.whatsappGroupJid;
}

export function validateRuntimeConfig(): void {
  requireDatabaseUrl();

  if (config.sendMinDelayMs > config.sendMaxDelayMs) {
    throw new Error(
      "SEND_MIN_DELAY_MS cannot be greater than SEND_MAX_DELAY_MS",
    );
  }
}
