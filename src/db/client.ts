import pg from "pg";
import { requireDatabaseUrl } from "../config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: requireDatabaseUrl(),
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
