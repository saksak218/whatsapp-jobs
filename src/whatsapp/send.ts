import { config, requireWhatsAppGroupJid } from "../config.js";
import type { NormalizedJob } from "../scrapers/types.js";
import { formatDate } from "../utils/dates.js";
import { logger } from "../utils/logger.js";
import { getWhatsAppClient } from "./client.js";

const templates = [
  "New clinical fellow job",
  "Clinical fellow vacancy found",
  "New NHS job alert"
];

function pickTemplate(jobId: string): string {
  const total = [...jobId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return templates[total % templates.length] ?? templates[0];
}

export function formatJobAlert(job: NormalizedJob): string {
  const lines = [
    pickTemplate(job.job_id),
    "",
    `Title: ${job.title}`,
    job.employer ? `Trust: ${job.employer}` : undefined,
    job.location ? `Location: ${job.location}` : undefined,
    job.salary ? `Salary: ${job.salary}` : undefined,
    job.closing_at ? `Closing: ${formatDate(job.closing_at)}` : undefined,
    "",
    job.url
  ];

  return lines.filter((line): line is string => line !== undefined).join("\n");
}

export async function sendJobAlert(job: NormalizedJob): Promise<void> {
  const message = formatJobAlert(job);

  if (config.dryRunSends) {
    logger.info({ job_id: job.job_id, message }, "dry-run WhatsApp send skipped");
    return;
  }

  const groupJid = requireWhatsAppGroupJid();
  const sock = getWhatsAppClient();
  await sock.sendMessage(groupJid, { text: message });
  logger.info({ job_id: job.job_id }, "WhatsApp job alert sent");
}
