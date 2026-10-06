import { config } from "../config.js";
import {
  closeWhatsAppClient,
  resetWhatsAppAuthForPairing,
  startWhatsAppClient,
  waitForWhatsAppAuthPersisted,
  waitForSocketOpen,
} from "../whatsapp/client.js";

if (!config.whatsappSenderNumber) {
  throw new Error(
    "Set WHATSAPP_SENDER_NUMBER in .env before running WhatsApp pairing",
  );
}

await resetWhatsAppAuthForPairing();
const sock = await startWhatsAppClient({ usePairingCode: true });
await waitForSocketOpen(sock);
await waitForWhatsAppAuthPersisted();

const groups = await sock.groupFetchAllParticipating();
const entries = Object.entries(groups ?? {});

console.log("WhatsApp linked successfully.");
if (entries.length === 0) {
  console.log("No participating groups were returned for this account.");
} else {
  console.log("Participating WhatsApp groups:");
  for (const [id, metadata] of entries) {
    console.log(`${metadata.subject ?? id}\n  ${id}`);
  }
}

await closeWhatsAppClient();
process.exit(0);
