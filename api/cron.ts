import { runScrapeCycle } from "../src/cron.js";
import { closeDatabase } from "../src/db/client.js";
import { logger } from "../src/utils/logger.js";

export const config = {
  maxDuration: 300,
};

function isAuthorized(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return true;

  const scheduleHeader = req.headers["x-vercel-cron-schedule"];
  if (scheduleHeader) return true;

  const userAgentHeader = req.headers["user-agent"];
  const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;
  if (userAgent?.includes("vercel-cron/1.0")) return true;

  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  return value === `Bearer ${cronSecret}`;
}

export default async function handler(
  req: { method?: string; headers: Record<string, string | string[] | undefined> },
  res: {
    status: (code: number) => {
      json: (body: unknown) => void;
      end: (body?: string) => void;
    };
  },
): Promise<void> {
  if (req.method && req.method !== "GET" && req.method !== "POST") {
    res.status(405).end("Method not allowed");
    return;
  }

  if (!isAuthorized(req)) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  try {
    const result = await runScrapeCycle();
    res.status(200).json({ ok: true, result });
  } catch (error) {
    logger.error({ error }, "Vercel cron handler failed");
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await closeDatabase();
  }
}
