import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const seenJobs = pgTable(
  "seen_jobs",
  {
    job_id: text("job_id").primaryKey(),
    source: text("source").notNull(),
    title: text("title").notNull(),
    employer: text("employer"),
    location: text("location"),
    salary: text("salary"),
    url: text("url").notNull(),
    posted_at: timestamp("posted_at", { withTimezone: true }),
    closing_at: timestamp("closing_at", { withTimezone: true }),
    first_seen: timestamp("first_seen", { withTimezone: true })
      .defaultNow()
      .notNull(),
    sent_at: timestamp("sent_at", { withTimezone: true }),
    raw: jsonb("raw"),
  },
  (table) => ({
    sourceIndex: index("idx_seen_jobs_source").on(table.source),
    sentAtIndex: index("idx_seen_jobs_sent_at").on(table.sent_at),
  }),
);
