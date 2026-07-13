# NHS Junior Clinical Fellow Job Alerts - Technical Plan

## 1. Goal

Build a code-based automation system that finds new junior doctor / clinical
fellow style jobs from NHS-related job websites and sends each new listing to a
WhatsApp group.

The user works with JavaScript frameworks like Next.js, React.js, and
Express.js, so this project should use the JavaScript/TypeScript ecosystem.
This is not an n8n workflow project. It is a coded Node.js application.

Target behavior:

- Scrape job sources every 10 minutes.
- Send jobs as soon as they are detected by the next scrape cycle.
- Match the configured keyword list for clinical fellow, foundation doctor,
  and core trainee style roles.
- Exclude senior clinical fellow / specialist registrar style roles.
- Save every seen job in Postgres.
- Send only new jobs to WhatsApp.
- Avoid duplicate messages.
- Run continuously on a free or almost-free always-on machine or VM.
- [x] Keep the WhatsApp sender number and session stable.

Important reality check: without an official webhook/RSS feed from each job
site, "as soon as posted" means "on the next polling cycle after the job appears
on the site." With a 10-minute cron, expected detection delay is usually 0 to 10
minutes after the listing becomes visible.

## 2. Target Sources

Initial v1 sources:

1. HealthJobsUK
   - Example URL:
     `https://www.healthjobsuk.com/job_list?JobSearch_q=&JobSearch_d=&JobSearch_g=255&JobSearch_re=*POST&JobSearch_re_0=1&JobSearch_re_1=1-*-*-&JobSearch_re_2=1-*-*--*-_-&JobSearch_Submit=Search&_tr=JobSearch&_ts=1170`
   - Need to verify the final keyword URL for `junior clinical fellow`.

2. NHS Jobs
   - Example URL:
     `https://www.jobs.nhs.uk/candidate/search/results?employerCode=C9348`
   - Need to verify whether keyword search, employer filtering, or both should
     be used.

3. NHS Scotland Jobs
   - Example URL:
     `https://apply.jobs.scot.nhs.uk/Home/Job`
   - Need to verify search/query parameters and whether results need
     JavaScript rendering.

4. NHSJobs.com / trust-hosted pages
   - Example URL:
     `https://www.nhsjobs.com/job/UK/London/London/Moorfields_Eye_Hospital_NHS_Foundation_Trust/Clinical_Fellow/Clinical_Fellow-v8146777?_ts=11156`
   - Need to verify whether this site has a reliable searchable listing page
     or whether it should be handled as a source of individual trust job pages.

5. HSCNI Jobs
   - Category URL:
     `https://jobs.hscni.net/Search?SearchCatID=63`
   - Medical & Dental category is server-rendered HTML and can be parsed with
     Cheerio.
   - Verified matching example:
     `https://jobs.hscni.net/Job/46128/71826143clinical-fellow-in-multiple-sclerosis`

## 3. Architecture Decision

Use one persistent Node.js process.

```text
node-cron every 10 min
  -> scrapeAll()
    -> scrapeHealthJobsUk()
    -> scrapeJobsNhsUk()
    -> scrapeNhsScotland()
    -> scrapeNhsJobsCom()
    -> scrapeHscni()
  -> normalize results
  -> insert into Postgres with ON CONFLICT DO NOTHING RETURNING *
  -> send only newly inserted jobs to WhatsApp
  -> mark sent_at after successful send
```

This stays simple:

- One process owns the schedule.
- One process owns the WhatsApp session.
- No queue/API layer is needed.
- No GitHub Actions or serverless cron is needed.
- Debugging is easier for a solo full-stack developer.
- It can run on free/almost-free infrastructure.

## 4. Why Not Official WhatsApp APIs Or Twilio

The target is a normal WhatsApp group where only admins can send messages. That
group can have many members, but official WhatsApp Business APIs cannot post
into normal pre-existing WhatsApp groups.

Twilio WhatsApp and other official WhatsApp Business providers are not the right
fit here for two reasons:

- They are paid or become paid at real usage.
- They cannot post into a normal WhatsApp group like a human admin account.

Therefore, the sender must use a WhatsApp Web style library:

- Recommended: `@whiskeysockets/baileys`
- The dedicated sender number must be added to the group.
- The dedicated sender number must be made an admin.
- The process logs in once by QR code.
- The auth session is persisted on disk.

This is unofficial automation. It can work, but there is non-zero account risk.
Use a dedicated number and avoid spammy send patterns.

## 4.1 Cost Target

The target is completely free or almost free.

Recommended low-cost setup:

- App hosting: Oracle Cloud Always Free VM, a spare PC, Raspberry Pi, or any
  already-owned always-on machine.
- Database: Neon free tier, or Postgres on the same VM.
- WhatsApp sending: Baileys, no paid API.
- Monitoring: logs through pm2/systemd first; add free alerts later only if
  needed.

Avoid adding paid services in v1. Do not add Twilio, paid WhatsApp providers,
paid queues, paid schedulers, or paid scraping APIs unless the user explicitly
changes the budget requirement.

## 5. Tech Stack

- Runtime: Node.js 20+
- Language: TypeScript
- Module system: ESM
- HTTP fetching: `axios` or `undici`
- HTML parsing: `cheerio`
- Browser fallback: `playwright`, only if a source requires JavaScript
- Scheduling: `node-cron`
- Database: Postgres
- ORM: Prisma preferred, raw `pg` acceptable if chosen early
- WhatsApp: `@whiskeysockets/baileys`
- Logging: `pino`
- Production process: `pm2` or `systemd`

Database provider can be:

- Neon
- Supabase
- Any normal Postgres instance

The app should treat all of them as standard Postgres through `DATABASE_URL`.

## 6. Data Model

Core table:

```sql
CREATE TABLE seen_jobs (
  job_id      TEXT PRIMARY KEY,
  source      TEXT NOT NULL,
  title       TEXT NOT NULL,
  employer    TEXT,
  location    TEXT,
  salary      TEXT,
  url         TEXT NOT NULL,
  posted_at   TIMESTAMPTZ,
  closing_at  TIMESTAMPTZ,
  first_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at     TIMESTAMPTZ,
  raw         JSONB
);

CREATE INDEX idx_seen_jobs_source ON seen_jobs(source);
CREATE INDEX idx_seen_jobs_sent_at ON seen_jobs(sent_at);
```

Atomic dedupe insert:

```sql
INSERT INTO seen_jobs (
  job_id, source, title, employer, location, salary, url, posted_at, closing_at, raw
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
ON CONFLICT (job_id) DO NOTHING
RETURNING *;
```

If the query returns a row, the job is new and should be sent. If it returns no
row, skip it.

After a successful WhatsApp send:

```sql
UPDATE seen_jobs
SET sent_at = now()
WHERE job_id = $1;
```

## 7. Normalized Job Shape

```ts
export type JobSource =
  | "healthjobsuk"
  | "jobs-nhs-uk"
  | "nhs-scotland"
  | "nhsjobs-com"
  | "hscni";

export interface NormalizedJob {
  job_id: string;
  source: JobSource;
  title: string;
  employer?: string;
  location?: string;
  salary?: string;
  url: string;
  posted_at?: Date;
  closing_at?: Date;
  raw?: unknown;
}
```

`job_id` must be stable and source-prefixed:

```text
healthjobsuk:123456
jobs-nhs-uk:C9348-26-0001
nhs-scotland:abc123
nhsjobs-com:Clinical_Fellow-v8146777
hscni:46128
```

## 8. Scraper Design

Folder shape:

```text
src/
  scrapers/
    types.ts
    healthJobsUk.ts
    jobsNhsUk.ts
    nhsScotland.ts
    nhsJobsCom.ts
    hscni.ts
    index.ts
```

Each scraper:

1. Builds its source-specific search URL.
2. Fetches HTML with `axios` or `undici`.
3. If plain HTML is insufficient, uses Playwright for that source only.
4. Parses the page with `cheerio`.
5. Extracts title, link, employer, location, salary, posted date, closing date,
   and reference ID where available.
6. Returns `NormalizedJob[]`.
7. Catches errors internally, logs them, and returns `[]`.

Important: Phase 1 must verify selectors before production scraper code is
trusted. Do not pretend guessed selectors are tested.

## 9. Matching Strategy

Default keywords:

```text
Clinical Fellow
Junior Clinical Fellow
Clinical Research Fellow
Foundation House officer 1
Foundation House Officer 2
Foundation Year 2
Core Trainee (CT1/2)
```

Do not use broad generic fallback terms such as `senior`, `fellow`, or `jcf`.

All scrapers must:

- Search every configured keyword where the site supports keyword search.
- Filter parsed job titles locally with the shared include/exclude matcher.
- Exclude senior-role signals including `Senior Clinical Fellow`,
  `Snr Clinical Fellow`, and `Spec Reg`.

## 10. WhatsApp Sending

Folder shape:

```text
src/
  whatsapp/
    client.ts
    send.ts
```

`client.ts`:

- Creates the Baileys socket.
- Persists auth state in `./auth_info/`.
- Prints QR code on first login.
- Reconnects on disconnect when appropriate.
- Exposes a safe way to get the active socket.

`send.ts`:

- Exports `sendJobAlert(job: NormalizedJob)`.
- Formats one job into a concise WhatsApp message.
- Sends only to `WHATSAPP_GROUP_JID`.

Example message:

```text
New clinical fellow job

Title: Junior Clinical Fellow
Trust: Example NHS Trust
Location: London
Salary: GBP 43,923 - GBP 63,152
Closing: 2026-08-01

https://example.com/job/123
```

Use 2 or 3 message templates and rotate them to reduce identical repeated
messages.

## 11. Scheduling And Cron

Use `node-cron` inside the same process.

Default:

```text
*/10 * * * *
```

Behavior:

1. Run one scrape cycle immediately on startup.
2. Schedule future scrape cycles every 10 minutes.
3. Run all source scrapers in parallel.
4. Insert jobs into Postgres.
5. Send only newly inserted jobs.
6. Wait between sends with randomized jitter.
7. Mark `sent_at` only after successful WhatsApp delivery call.

Pseudo-code:

```ts
cron.schedule(config.scrapeIntervalCron, async () => {
  try {
    const jobs = await scrapeAll();
    const newJobs = await dedupeAndInsert(jobs);

    for (const job of newJobs) {
      await sendJobAlert(job);
      await markJobSent(job.job_id);
      await sleep(8000 + Math.random() * 7000);
    }
  } catch (error) {
    logger.error({ error }, "scrape cycle failed");
  }
});
```

Use jitter around 8 to 15 seconds between sends. Do not send 25 to 50 messages
as one instant burst.

If a source exposes a reliable RSS feed, public API, sitemap timestamp, or other
lighter change signal, prefer checking that first. If no such signal exists,
10-minute polling is the practical near-real-time approach.

## 12. Environment Variables

```text
DATABASE_URL=postgres://user:pass@host:5432/dbname
WHATSAPP_GROUP_JID=1203xxxxxxxxx@g.us
SEARCH_KEYWORDS=Clinical Fellow,Junior Clinical Fellow,Clinical Research Fellow,Foundation House officer 1,Foundation House Officer 2,Foundation Year 2,Core Trainee (CT1/2)
SCRAPE_INTERVAL_CRON=*/10 * * * *
LOG_LEVEL=info
```

Optional later:

```text
SEND_MIN_DELAY_MS=8000
SEND_MAX_DELAY_MS=15000
PLAYWRIGHT_HEADLESS=true
```

Never commit a populated `.env`.

## 13. Production Deployment

Recommended simple deployment:

1. Provision an always-on free/almost-free host, such as Oracle Cloud Always
   Free, a spare PC, Raspberry Pi, or another cheap VM.
2. Install Node.js 20+, git, and pm2.
3. Clone this repo.
4. Install dependencies.
5. Configure `.env`.
6. Run database migration.
7. Build the app.
8. Start with pm2.
9. Scan the WhatsApp QR code on first run.
10. Confirm the sender number is an admin of the WhatsApp group.
11. Confirm messages survive process restart without re-scanning QR.

Expected commands once implemented:

```text
npm install
npm run build
npm run db:migrate
pm2 start dist/index.js --name nhs-job-alerts
pm2 logs nhs-job-alerts
pm2 save
pm2 startup
```

## 14. Risk Controls

WhatsApp:

- Use a dedicated number.
- Warm the number up before automation if it is new.
- Send to one group, not many unrelated chats.
- Keep jittered delay between sends.
- Rotate wording slightly.
- Log disconnects.
- Persist `auth_info/`.
- Do not use Twilio or a paid WhatsApp provider for group sending.

Scraping:

- Keep request volume polite.
- Identify broken selectors quickly through logs.
- Keep per-source failures isolated.
- Use Playwright only when necessary.
- HealthJobsUK and NHSJobs.com currently return HTTP 403 to direct HTTP
  scraping in live tests. Keep direct HTTP first, log these as blocked-source
  failures, then use free-first alternatives: browser-mode scraping with polite
  rate limits, public job-alert email ingestion, or mirrored trust/NHS Jobs
  listings. Do not add paid scraping/search APIs unless the user explicitly
  changes the budget.

Database:

- Use atomic insert dedupe.
- Store `sent_at`.
- Later add a retry sweep for `sent_at IS NULL`.

## 15. Project Structure

```text
nhsJobs/
  src/
    index.ts
    config.ts
    cron.ts
    dedupe.ts
    db/
      client.ts
      schema.prisma
    scrapers/
      types.ts
      healthJobsUk.ts
      jobsNhsUk.ts
      nhsScotland.ts
      nhsJobsCom.ts
      hscni.ts
      index.ts
    whatsapp/
      client.ts
      send.ts
    utils/
      logger.ts
      sleep.ts
  auth_info/
  .env.example
  .gitignore
  package.json
  tsconfig.json
  PLAN.md
  AGENT.md
```

## 16. Phase Todo List

Update this checklist as we build. Mark a task `[x]` only when it is actually
done and verified.

### Phase 0 - Project Direction And Docs

- [x] Read the previous AI chat and capture the key decisions.
- [x] Confirm this will be built with code, not n8n.
- [x] Confirm JavaScript/TypeScript stack.
- [x] Confirm the target is free or almost free.
- [x] Confirm polling should run every 10 minutes by default.
- [x] Confirm normal WhatsApp group sending requires Baileys, not official
      WhatsApp APIs or Twilio.
- [x] Update `PLAN.md` with a complete implementation plan.
- [x] Update `AGENT.md` with project context for future AI agents.

### Phase 1 - Source Verification

- [ ] Open HealthJobsUK search results for configured keywords.
- [ ] Confirm HealthJobsUK keyword query parameters.
- [ ] Confirm HealthJobsUK job card selectors and stable job ID source.
- [x] Open NHS Jobs search results for configured keywords.
- [x] Confirm NHS Jobs keyword/employer query parameters.
- [x] Confirm NHS Jobs job card selectors and stable job ID source.
- [x] Open NHS Scotland Jobs search results for configured keywords.
- [x] Confirm NHS Scotland query parameters.
- [x] Confirm NHS Scotland job card selectors and stable job ID source.
- [x] Open HSCNI Medical & Dental results.
- [x] Confirm HSCNI keyword/category query parameters.
- [x] Confirm HSCNI job card selectors and stable job ID source.
- [ ] Investigate NHSJobs.com search/listing behavior.
- [ ] Confirm whether NHSJobs.com should be scraped by search page, trust page,
      sitemap, or individual job pages.
- [ ] Decide which sources need Playwright and which can use plain HTTP.
- [ ] Check whether any source provides RSS, sitemap timestamps, or another
      lightweight feed for faster/lower-cost detection.
- [ ] Update this plan with verified selectors and URLs.

### Phase 2 - Project Setup

- [x] Create `package.json`.
- [x] Install TypeScript, runtime, scraper, database, cron, logging, and
      WhatsApp dependencies.
- [x] Create `tsconfig.json`.
- [x] Create `.env-example`.
- [x] Create `.gitignore` including `.env`, `auth_info/`, and build outputs.
- [x] Add expected npm scripts.
- [x] Create base `src/` folder structure.

### Phase 3 - Database

- [x] Choose Drizzle ORM with Postgres.
- [x] Create Postgres schema for `seen_jobs`.
- [x] Create database client module.
- [x] Implement `dedupeAndInsert(jobs)`.
- [x] Implement `markJobSent(job_id)`.
- [x] Verify the table exists in Neon and the app can connect to the database.

### Phase 4 - Scrapers

- [x] Define `NormalizedJob` and source types.
- [x] Implement HealthJobsUK scraper.
- [x] Implement NHS Jobs scraper.
- [x] Implement NHS Scotland scraper.
- [x] Implement NHSJobs.com scraper or verified alternative.
- [x] Implement HSCNI scraper.
- [x] Implement shared include/exclude matcher with senior-role exclusion.
- [x] Update scrapers to search all configured keywords.
- [x] Implement `scrapeAll()` to run sources in parallel.
- [x] Add scraper test command that prints normalized results without DB writes.
- [x] Add scraper structure and normalization logic; live-site selector verification remains the next refinement step.

### Phase 5 - WhatsApp Integration

- [ ] Create or choose the dedicated WhatsApp sender number.
- [ ] Create the WhatsApp group.
- [ ] Set group messaging permission to admins only.
- [ ] Add sender number to the group.
- [ ] Make sender number an admin.
- [x] Implement Baileys client connection.
- [x] Persist auth state in `auth_info/`.
- [x] Log QR code for first authentication.
- [ ] Find and set `WHATSAPP_GROUP_JID`.
- [x] Implement `sendJobAlert(job)`.
- [ ] Send one manual test message to the group.

### Phase 6 - Cron Pipeline

- [x] Implement startup scrape cycle.
- [x] Implement `node-cron` schedule.
- [x] Set default schedule to every 10 minutes.
- [x] Wire scrape -> dedupe -> send -> mark sent.
- [x] Add jittered delay between sends.
- [x] Ensure one source failure does not stop other sources.
- [x] Ensure one send failure is logged and does not corrupt dedupe state.
- [x] The pipeline code is implemented; the final end-to-end run still needs a live WhatsApp session and a real scrape result.

### Phase 7 - Deployment

- [ ] Provision always-on VM.
- [ ] Install Node.js 20+, git, and pm2.
- [ ] Configure production `.env`.
- [ ] Run database migrations.
- [ ] Build app.
- [ ] Start app with pm2 or systemd.
- [ ] Authenticate WhatsApp by QR code.
- [ ] Confirm `auth_info/` persists across restart.
- [ ] Confirm scheduled scrape runs in production.
- [ ] Confirm new jobs post to WhatsApp.

### Phase 8 - Hardening

- [ ] Add retry sweep for jobs where `sent_at IS NULL`.
- [ ] Add per-source error counters in logs.
- [ ] Add alerting for WhatsApp disconnect/logout.
- [ ] Add polite backoff if a source starts blocking requests.
- [ ] Add include/exclude keyword rules if needed.
- [ ] Add a small admin/status command or script if useful.

## 17. Immediate Next Step

The codebase is now mostly wired up for the core pipeline. The next work is to
verify the live HTML for each source, then turn on the real WhatsApp flow.

Baileys should be activated once you have:

- a dedicated WhatsApp sender number,
- a target WhatsApp group,
- the real `WHATSAPP_GROUP_JID`, and
- a working `.env` configuration.

At that point, switch `DRY_RUN_SENDS=false` and run the WhatsApp test flow.

Before writing scraper code, inspect the live HTML for each source and record:

- Final search URL.
- Whether JavaScript rendering is required.
- Job card selector.
- Title selector.
- Link selector.
- Employer selector.
- Location selector.
- Salary selector.
- Posted date selector.
- Closing date selector.
- Stable reference/job ID source.
