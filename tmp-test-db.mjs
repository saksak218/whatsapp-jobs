import "dotenv/config";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });

try {
  const rows = await sql`select 1 as ok`;
  console.log(JSON.stringify(rows[0], null, 2));
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  await sql.end();
}
