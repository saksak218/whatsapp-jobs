import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config, requireDatabaseUrl } from "../config.js";

const connectionString = requireDatabaseUrl();

function databaseSsl(): "require" | false {
  if (config.databaseSsl === "require") return "require";
  if (config.databaseSsl === "disable") return false;

  try {
    const hostname = new URL(connectionString).hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") {
      return false;
    }
  } catch {
    // Let postgres produce the useful connection-string error below.
  }

  return "require";
}

export const client = postgres(connectionString, {
  max: 5,
  idle_timeout: 20,
  connect_timeout: config.dbConnectTimeoutSeconds,
  ssl: databaseSsl(),
});
export const db = drizzle(client);

export async function closeDatabase(): Promise<void> {
  await client.end();
}
