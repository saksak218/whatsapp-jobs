import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { client, closeDatabase } from "../db/client.js";
import { logger } from "../utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../../migrations");

const files = (await readdir(migrationsDir))
  .filter((file) => file.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

for (const file of files) {
  const sqlText = await readFile(path.join(migrationsDir, file), "utf8");
  logger.info({ file }, "running migration");
  await client.unsafe(sqlText);
}

await closeDatabase();
logger.info({ count: files.length }, "migrations complete");
