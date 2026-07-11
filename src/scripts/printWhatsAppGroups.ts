import { listParticipatingGroups } from "../whatsapp/client.js";

const groups = await listParticipatingGroups();

if (groups.length === 0) {
  console.log("No WhatsApp groups were returned for this account.");
  process.exit(0);
}

console.log("Participating WhatsApp groups:");
for (const group of groups) {
  console.log(`${group.subject}\n  ${group.id}`);
}
