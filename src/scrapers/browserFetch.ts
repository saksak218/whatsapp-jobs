import path from "node:path";
import { chromium, type BrowserContext } from "playwright";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

let contextPromise: Promise<BrowserContext> | undefined;
let browserQueue: Promise<void> = Promise.resolve();

function browserProfileDir(): string {
  return path.isAbsolute(config.browserProfileDir)
    ? config.browserProfileDir
    : path.join(process.cwd(), config.browserProfileDir);
}

async function getBrowserContext(): Promise<BrowserContext> {
  contextPromise ??= chromium
    .launchPersistentContext(browserProfileDir(), {
      headless: true,
      viewport: { width: 1366, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    })
    .catch((error) => {
      contextPromise = undefined;
      throw error;
    });

  return contextPromise;
}

async function withBrowserQueue<T>(task: () => Promise<T>): Promise<T> {
  const previous = browserQueue;
  let release!: () => void;
  browserQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;

  try {
    return await task();
  } finally {
    release();
  }
}

export async function fetchBrowserHtml(url: string): Promise<string> {
  if (!config.browserFallbackEnabled) {
    throw new Error("browser fallback is disabled");
  }

  return withBrowserQueue(async () => {
    const context = await getBrowserContext();
    const page = await context.newPage();

    try {
      await page.route("**/*", async (route) => {
        const resourceType = route.request().resourceType();
        if (resourceType === "image" || resourceType === "font" || resourceType === "media") {
          await route.abort();
          return;
        }

        await route.continue();
      });

      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: config.browserTimeoutMs,
      });

      if (!response) {
        throw new Error(`browser navigation to ${url} returned no response`);
      }

      const status = response.status();
      if (status === 403 || status === 429) {
        throw new Error(`browser GET ${url} failed with status ${status}`);
      }

      if (status < 200 || status >= 400) {
        throw new Error(`browser GET ${url} failed with status ${status}`);
      }

      await page.waitForTimeout(1500);
      return await page.content();
    } finally {
      await page.close().catch((error) => {
        logger.warn({ error }, "failed to close browser fallback page");
      });
    }
  });
}

export async function closeBrowserFallback(): Promise<void> {
  if (!contextPromise) return;

  const context = await contextPromise;
  contextPromise = undefined;
  await context.close();
}
