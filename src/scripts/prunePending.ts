import { closeDatabase, client } from "../db/client.js";

const keepArgument = process.argv.find((argument) => argument.startsWith("--keep="));
const keep = Number.parseInt(keepArgument?.split("=")[1] ?? "", 10);
const confirmed = process.argv.includes("--confirm");

if (!confirmed || !Number.isInteger(keep) || keep < 0) {
  throw new Error(
    "Usage: npm run pending:prune -- --keep=<non-negative integer> --confirm",
  );
}

try {
  const deleted = await client.begin(async (sql) => {
    const rows = await sql`
      with kept as (
        select job_id
        from seen_jobs
        where sent_at is null
        order by first_seen desc, job_id desc
        limit ${keep}
      ), archived as (
        insert into ignored_jobs (job_id)
        select job_id
        from seen_jobs
        where sent_at is null
          and not exists (
            select 1 from kept where kept.job_id = seen_jobs.job_id
          )
        on conflict (job_id) do nothing
      )
      delete from seen_jobs
      where sent_at is null
        and not exists (
          select 1 from kept where kept.job_id = seen_jobs.job_id
        )
      returning job_id
    `;

    return rows;
  });

  const [remaining] = await client<[{ pending: number }]>`
    select count(*)::int as pending
    from seen_jobs
    where sent_at is null
  `;

  console.log(
    JSON.stringify({
      deletedPendingJobs: deleted.length,
      remainingPendingJobs: remaining?.pending ?? 0,
      requestedKeep: keep,
    }),
  );
} finally {
  await closeDatabase();
}
