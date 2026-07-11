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

export const config = {
  databaseUrl: env("DATABASE_URL"),
  whatsappGroupJid: env("WHATSAPP_GROUP_JID"),
  searchKeyword: env("SEARCH_KEYWORD", "junior clinical fellow"),
  scrapeIntervalCron: env("SCRAPE_INTERVAL_CRON", "*/10 * * * *"),
  logLevel: env("LOG_LEVEL", "info"),
  sendMinDelayMs: envInt("SEND_MIN_DELAY_MS", 8000),
  sendMaxDelayMs: envInt("SEND_MAX_DELAY_MS", 15000),
  dryRunSends: envBool("DRY_RUN_SENDS", false),
  sources: {
    healthJobsUk: envBool("ENABLE_HEALTHJOBSUK", true),
    jobsNhsUk: envBool("ENABLE_JOBS_NHS_UK", true),
    nhsScotland: envBool("ENABLE_NHS_SCOTLAND", true),
    nhsJobsCom: envBool("ENABLE_NHSJOBS_COM", true)
  }
} as const;

export function requireDatabaseUrl(): string {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return config.databaseUrl;
}

export function requireWhatsAppGroupJid(): string {
  if (!config.whatsappGroupJid) {
    throw new Error("WHATSAPP_GROUP_JID is required unless DRY_RUN_SENDS=true");
  }

  return config.whatsappGroupJid;
}

export function validateRuntimeConfig(): void {
  requireDatabaseUrl();

  if (!config.dryRunSends) {
    requireWhatsAppGroupJid();
  }

  if (config.sendMinDelayMs > config.sendMaxDelayMs) {
    throw new Error("SEND_MIN_DELAY_MS cannot be greater than SEND_MAX_DELAY_MS");
  }
}
