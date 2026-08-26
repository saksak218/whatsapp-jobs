import {
  closeWhatsAppClient,
  listParticipatingGroups,
} from "../whatsapp/client.js";

try {
  const groups = await listParticipatingGroups();

  if (groups.length === 0) {
    console.log("No WhatsApp groups were returned for this account.");
  } else {
    console.log("Participating WhatsApp groups:");
    for (const group of groups) {
      console.log(`${group.subject}\n  ${group.id}`);
    }
  }
} finally {
  await closeWhatsAppClient();
}

process.exit(0);
