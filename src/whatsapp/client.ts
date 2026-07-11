import { Boom } from "@hapi/boom";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import { logger } from "../utils/logger.js";

let socket: WASocket | undefined;
let connecting: Promise<WASocket> | undefined;

export async function startWhatsAppClient(): Promise<WASocket> {
  if (socket) return socket;
  if (connecting) return connecting;

  connecting = connect();
  socket = await connecting;
  connecting = undefined;
  return socket;
}

export function getWhatsAppClient(): WASocket {
  if (!socket) {
    throw new Error("WhatsApp client is not connected");
  }

  return socket;
}

async function connect(): Promise<WASocket> {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger
  });

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", (update) => {
    if (update.qr) {
      logger.info("scan WhatsApp QR code to authenticate sender number");
      qrcode.generate(update.qr, { small: true });
    }

    if (update.connection === "open") {
      socket = sock;
      logger.info("WhatsApp client connected");
    }

    if (update.connection === "close") {
      const statusCode = (update.lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      socket = undefined;

      logger.warn({ statusCode, shouldReconnect }, "WhatsApp client disconnected");

      if (shouldReconnect) {
        connecting = connect().catch((error) => {
          connecting = undefined;
          logger.error({ error }, "WhatsApp reconnect failed");
          throw error;
        });
      }
    }
  });

  return sock;
}
