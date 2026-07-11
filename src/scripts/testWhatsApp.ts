import { config } from "../config.js";
import { startWhatsAppClient } from "../whatsapp/client.js";
import { sendJobAlert } from "../whatsapp/send.js";

if (config.dryRunSends) {
  throw new Error(
    "Set DRY_RUN_SENDS=false to send a real WhatsApp test message",
  );
}

await startWhatsAppClient();

await sendJobAlert({
  job_id: "manual:test",
  source: "jobs-nhs-uk",
  title: "Manual test job alert",
  employer: "Test NHS Trust",
  location: "Test location",
  url: "https://www.jobs.nhs.uk/",
});
