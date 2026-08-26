import { config } from "../config.js";
import {
  closeWhatsAppClient,
  startWhatsAppClient,
} from "../whatsapp/client.js";
import { sendJobAlert } from "../whatsapp/send.js";

try {
  if (!config.dryRunSends && !config.disableWhatsAppSends) {
    await startWhatsAppClient();
  }

  await sendJobAlert({
    job_id: "manual:test",
    source: "hscni",
    title: "Manual test job alert",
    employer: "Test NHS Trust",
    location: "Test location",
    url: "https://www.jobs.nhs.uk/",
  });
} finally {
  await closeWhatsAppClient();
}

process.exit(0);
