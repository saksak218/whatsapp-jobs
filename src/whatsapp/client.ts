import { promises as fs } from "fs";
import path from "node:path";
import { Boom } from "@hapi/boom";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestWaWebVersion,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

let socket: WASocket | undefined;
let connecting: Promise<WASocket> | undefined;
let resolvedGroupJid: string | undefined;
let socketReady = false;

const authStateDir = path.isAbsolute(config.whatsappAuthDir)
  ? config.whatsappAuthDir
  : path.join(process.cwd(), config.whatsappAuthDir);

function normalizePhoneNumber(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\D/g, "");
  return normalized || undefined;
}

function connectedPhoneNumber(sock: WASocket): string | undefined {
  return normalizePhoneNumber(sock.user?.id?.split(":")[0]);
}

async function ensureAuthStateDir(): Promise<void> {
  await fs.mkdir(authStateDir, { recursive: true });
}

async function clearAuthState(): Promise<void> {
  try {
    await fs.rm(authStateDir, { recursive: true, force: true });
    await ensureAuthStateDir();
    logger.info("Cleared stale WhatsApp auth state");
  } catch (error) {
    logger.warn({ error }, "Failed to clear WhatsApp auth state");
  }
}

async function cleanupSocket(sock?: WASocket): Promise<void> {
  if (!sock) return;

  try {
    sock.ev.removeAllListeners("connection.update");
    sock.ws?.close?.();
  } catch (error) {
    logger.warn({ error }, "Failed to close stale WhatsApp socket cleanly");
  }
}

export interface DisconnectClassification {
  statusCode?: number;
  message: string;
  isReplaced: boolean;
  isQrTimeout: boolean;
  shouldReconnect: boolean;
}

export function classifyDisconnect(input: {
  statusCode?: number;
  message?: string;
}): DisconnectClassification {
  const statusCode = input.statusCode;
  const message = input.message ?? "";
  const isReplaced =
    statusCode === 440 ||
    statusCode === DisconnectReason.connectionReplaced ||
    message.includes("conflict") ||
    message.includes("replaced");
  const isQrTimeout =
    statusCode === 408 || message.includes("QR refs attempts ended");

  return {
    statusCode,
    message,
    isReplaced,
    isQrTimeout,
    shouldReconnect:
      !isReplaced && !isQrTimeout && statusCode !== DisconnectReason.loggedOut,
  };
}

export async function startWhatsAppClient(): Promise<WASocket> {
  if (socket) return socket;
  if (connecting) return connecting;

  connecting = connect();
  try {
    const connectedSocket = await connecting;
    connecting = undefined;
    return connectedSocket;
  } catch (error) {
    connecting = undefined;
    throw error;
  }
}

export function getWhatsAppClient(): WASocket {
  if (!socket) {
    throw new Error("WhatsApp client is not connected");
  }

  return socket;
}

export async function listParticipatingGroups(): Promise<
  Array<{ id: string; subject: string }>
> {
  const sock = await startWhatsAppClient();
  await waitForSocketOpen(sock);
  const groups = await sock.groupFetchAllParticipating();

  return Object.entries(groups ?? {}).map(([id, metadata]) => ({
    id,
    subject: metadata.subject ?? id,
  }));
}

function isPlaceholderGroupTarget(value: string): boolean {
  return /x{3,}|example|placeholder|your[-_ ]group/i.test(value.trim());
}

function normalizeGroupTarget(value: string | undefined): string | undefined {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (!trimmed || isPlaceholderGroupTarget(trimmed)) {
    return undefined;
  }

  return trimmed;
}

function findMatchingGroup(
  groups: Array<{ id: string; subject: string }>,
  preferredName?: string,
): { id: string; subject: string } | undefined {
  if (!preferredName) return undefined;

  const normalized = preferredName.trim().toLowerCase();
  return groups.find((group) => {
    const subject = group.subject.toLowerCase();
    const id = group.id.toLowerCase();
    return (
      subject === normalized ||
      subject.includes(normalized) ||
      id.includes(normalized)
    );
  });
}

export async function resolveWhatsAppGroupJid(): Promise<string> {
  if (resolvedGroupJid) {
    return resolvedGroupJid;
  }

  const configuredJid = normalizeGroupTarget(config.whatsappGroupJid);
  if (configuredJid) {
    resolvedGroupJid = configuredJid;
    return configuredJid;
  }

  const preferredName = normalizeGroupTarget(config.whatsappGroupName);
  const groups = await listParticipatingGroups();

  if (preferredName) {
    const matchedGroup = findMatchingGroup(groups, preferredName);
    if (matchedGroup) {
      resolvedGroupJid = matchedGroup.id;
      return matchedGroup.id;
    }
  }

  if (groups.length === 1) {
    resolvedGroupJid = groups[0].id;
    return groups[0].id;
  }

  throw new Error(
    `No WhatsApp group target could be resolved. Set WHATSAPP_GROUP_JID to a real JID or WHATSAPP_GROUP_NAME to a group name. Available groups: ${
      groups.map((group) => `${group.subject} (${group.id})`).join(", ") ||
      "none"
    }`,
  );
}

async function connect(): Promise<WASocket> {
  await ensureAuthStateDir();
  const { state, saveCreds } = await useMultiFileAuthState(authStateDir);
  const waWebVersion = await fetchLatestWaWebVersion().catch(() => ({
    version: [2, 3000, 1023223821] as [number, number, number],
    isLatest: false,
  }));

  logger.info({ version: waWebVersion.version }, "using WhatsApp web version");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger,
    browser: Browsers.ubuntu("NHS Jobs Alerts"),
    version: waWebVersion.version,
  });

  sock.ev.on("creds.update", saveCreds);
  return new Promise((resolve, reject) => {
    let settled = false;
    const startupTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        void cleanupSocket(sock);
        reject(new Error("WhatsApp pairing did not complete in time"));
      }
    }, 180000);

    const resolveOpenSocket = () => {
      if (settled) return;
      settled = true;
      clearTimeout(startupTimer);
      resolve(sock);
    };

    const rejectStartup = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(startupTimer);
      void cleanupSocket(sock);
      reject(error);
    };

    const reconnectBeforeOpen = () => {
      void cleanupSocket(sock);
      connect().then(
        (reconnectedSocket) => {
          if (settled) return;
          settled = true;
          clearTimeout(startupTimer);
          resolve(reconnectedSocket);
        },
        (error: unknown) => {
          rejectStartup(
            error instanceof Error
              ? error
              : new Error("WhatsApp reconnect failed before startup completed"),
          );
        },
      );
    };

    sock.ev.on("connection.update", (update) => {
      logger.info(
        { connection: update.connection, hasQr: Boolean(update.qr) },
        "WhatsApp connection update",
      );

      if (update.qr) {
        logger.info("scan WhatsApp QR code to authenticate sender number");
        qrcode.generate(update.qr, { small: true });
        console.log(
          "\nQR code printed above. Scan it with WhatsApp on your phone.\n",
        );
      }

      if (update.connection === "open") {
        socket = sock;
        socketReady = true;
        resolvedGroupJid = undefined;
        const expectedSender = normalizePhoneNumber(config.whatsappSenderNumber);
        const connectedSender = connectedPhoneNumber(sock);
        if (
          expectedSender &&
          connectedSender &&
          expectedSender !== connectedSender
        ) {
          logger.warn(
            { expectedSender, connectedSender },
            "Connected WhatsApp sender does not match WHATSAPP_SENDER_NUMBER",
          );
        } else if (connectedSender) {
          logger.info({ connectedSender }, "WhatsApp sender number confirmed");
        }
        logger.info("WhatsApp client connected");
        console.log("WhatsApp connected successfully.");
        resolveOpenSocket();
      }

      if (update.connection === "close") {
        const statusCode = (update.lastDisconnect?.error as Boom | undefined)
          ?.output?.statusCode;
        const message = update.lastDisconnect?.error?.message ?? "";
        const disconnectInfo = classifyDisconnect({ statusCode, message });

        socket = undefined;
        socketReady = false;

        logger.warn(disconnectInfo, "WhatsApp client disconnected");

        if (disconnectInfo.isReplaced) {
          void cleanupSocket(sock);
          void clearAuthState();
          connecting = undefined;
          logger.warn(
            "WhatsApp session was replaced; a fresh QR scan is required",
          );
          rejectStartup(
            new Error(
              "WhatsApp session was replaced; a fresh QR scan is required",
            ),
          );
          return;
        }

        if (disconnectInfo.isQrTimeout) {
          logger.warn(
            "WhatsApp QR pairing timed out; waiting for a fresh QR scan or manual re-auth",
          );
          connecting = undefined;
          rejectStartup(new Error("WhatsApp QR pairing timed out"));
          return;
        }

        if (disconnectInfo.shouldReconnect) {
          if (!settled) {
            logger.info(
              disconnectInfo,
              "WhatsApp restart required before startup completed; reconnecting",
            );
            reconnectBeforeOpen();
            return;
          }

          connecting = connect().catch((error) => {
            connecting = undefined;
            logger.error({ error }, "WhatsApp reconnect failed");
            throw error;
          });
          return;
        }

        rejectStartup(new Error(`WhatsApp connection closed: ${message}`));
      }
    });
  });
}

export async function waitForSocketOpen(sock: WASocket): Promise<WASocket> {
  if (socketReady && socket === sock) {
    return sock;
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      sock.ev.off("connection.update", onUpdate);
      reject(new Error("WhatsApp pairing did not complete in time"));
    }, 180000);

    const onUpdate = (update: { connection?: string }) => {
      if (update.connection === "open") {
        clearTimeout(timer);
        sock.ev.off("connection.update", onUpdate);
        resolve(sock);
        return;
      }

      if (update.connection === "close") {
        clearTimeout(timer);
        sock.ev.off("connection.update", onUpdate);
        reject(new Error("WhatsApp connection closed before it opened"));
      }
    };

    sock.ev.on("connection.update", onUpdate);
  });
}
