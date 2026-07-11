import "dotenv/config";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

try {
  const rows = await sql`select to_regclass('public.seen_jobs') as table_name`;
  console.log(JSON.stringify(rows[0], null, 2));
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  await sql.end();
}
