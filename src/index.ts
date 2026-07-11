import { config, validateRuntimeConfig } from "./config.js";
import { runScrapeCycle, startScheduler } from "./cron.js";
import { closeDatabase } from "./db/client.js";
import { logger } from "./utils/logger.js";
import { startWhatsAppClient } from "./whatsapp/client.js";

validateRuntimeConfig();

if (!config.dryRunSends) {
  await startWhatsAppClient();
} else {
  logger.warn("DRY_RUN_SENDS=true; WhatsApp messages will not be sent");
}

startScheduler();
void runScrapeCycle();

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down");
  await closeDatabase();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
