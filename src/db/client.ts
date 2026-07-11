import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { requireDatabaseUrl } from "../config.js";

const connectionString = requireDatabaseUrl();
export const client = postgres(connectionString, {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: "require",
});
export const db = drizzle(client);

export async function closeDatabase(): Promise<void> {
  await client.end();
}
