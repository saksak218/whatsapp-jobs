import { config, validateRuntimeConfig } from "./config.js";
import { runScrapeCycle, startScheduler } from "./cron.js";
import { closeDatabase } from "./db/client.js";
import { logger } from "./utils/logger.js";
import { startWhatsAppClient } from "./whatsapp/client.js";

validateRuntimeConfig();

if (!config.dryRunSends && !config.disableWhatsAppSends) {
  await startWhatsAppClient().catch((error) => {
    logger.error(
      { error },
      "WhatsApp startup failed; scraper will continue and retry sends during cycles",
    );
  });
} else {
  logger.warn("WhatsApp messages are disabled for this runtime");
}

startScheduler();
void runScrapeCycle().catch((error) => {
  logger.error({ error }, "initial scrape cycle failed");
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down");
  await closeDatabase();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
