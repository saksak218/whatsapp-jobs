# AGENT.md - context for AI coding agents working on this repo

Read this before making changes. This project is for a JavaScript/TypeScript
full-stack developer, so prefer Node.js, TypeScript, and familiar JS ecosystem
tools unless the user explicitly asks for another stack.

The complete build plan and task checklist live in `PLAN.md`. Keep `PLAN.md`
updated as work is completed by changing task checkboxes from `[ ]` to `[x]`.

## What This Project Does

A single long-running Node.js process will:

1. Scrape NHS job sources every 10 minutes for roles matching the configured
   clinical fellow, foundation doctor, and core trainee keyword list.
2. Normalize all listings into one shared job shape.
3. Insert jobs into Postgres with an atomic dedupe query so each job is only
   processed once.
4. Send each genuinely new job to one WhatsApp group where only admins can
   post.

The user has not created the WhatsApp group yet. The plan assumes the user
will create a normal WhatsApp group, set "Only admins can send messages", add
the dedicated sender number as an admin, and then provide the group JID.

The user wants a completely free or almost-free build. Prefer free-tier
infrastructure and open-source libraries:

- Oracle Cloud Always Free VM, a spare PC, or another always-on free/cheap host.
- Neon/free Postgres, or Postgres on the same VM.
- Baileys for WhatsApp Web style sending.
- No paid Twilio/WhatsApp Business messaging path.

## Sources To Support

Treat these as first-class sources for v1:

- HealthJobsUK:
  `https://www.healthjobsuk.com/job_list?...`
- NHS Jobs:
  `https://www.jobs.nhs.uk/candidate/search/results?employerCode=C9348`
- NHS Scotland Jobs:
  `https://apply.jobs.scot.nhs.uk/Home/Job`
- NHSJobs.com / trust-hosted job pages:
  `https://www.nhsjobs.com/job/UK/London/London/Moorfields_Eye_Hospital_NHS_Foundation_Trust/Clinical_Fellow/Clinical_Fellow-v8146777?...`
- HSCNI Jobs:
  `https://jobs.hscni.net/Search?SearchCatID=63`

Do not assume the provided URLs are final production search URLs. Phase 1 in
`PLAN.md` is specifically for verifying search URLs, query parameters, whether
JavaScript rendering is required, and the real HTML selectors for each source.

## Key Architecture Decision

Use one persistent process rather than split scraper/serverless/sender pieces.

Reason: the WhatsApp connection uses an unofficial WhatsApp Web style session
through Baileys. That connection must stay authenticated and available. Keeping
scraping, dedupe, scheduling, and sending in the same process is simpler and
removes the need for an extra queue/API layer.

Do not propose GitHub Actions, serverless cron, microservices, or n8n as the
main architecture unless the user asks to revisit the decision. The user
explicitly chose to build this with code.

## Tech Stack

- Node.js 20+
- TypeScript
- ESM modules
- `axios` or `undici` for HTTP fetching
- `cheerio` for HTML parsing
- `playwright` only for sources that actually require JavaScript rendering
- `node-cron` for the internal 10-minute schedule
- Postgres through Prisma, unless the repo has already chosen raw `pg`
- `@whiskeysockets/baileys` for WhatsApp group sending
- `pino` for logging
- `pm2` or `systemd` for production process management

Do not swap these choices without asking.

## WhatsApp Decision

The official WhatsApp Cloud API, Twilio WhatsApp API, and similar official
business APIs are not suitable for posting into a normal pre-existing WhatsApp
group with many members. The normal group can have many members, but official
business APIs cannot post into it.

For this project, group sending must use Baileys. The account behaves like a
WhatsApp Web session for a dedicated number that is an admin of the group.

Do not add Twilio dependencies or Twilio environment variables. Twilio is paid
and does not meet the normal WhatsApp group requirement for this project.

This is unofficial API territory. Keep the risks visible:

- Use a dedicated number, not a personal number.
- Keep send pacing human-like.
- Preserve randomized delay/jitter between messages.
- Avoid sending large bursts without delay.
- Rotate message wording slightly.
- Persist the auth session folder across deploys.

## Database Rules

The database is standard Postgres. `DATABASE_URL` may point at Neon or any
normal Postgres instance. Do not hardcode provider-specific behavior.

The core table is `seen_jobs`. The unique `job_id` is the dedupe mechanism.
Use an atomic insert:

```sql
INSERT INTO seen_jobs (job_id, source, title, employer, location, url, posted_at)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (job_id) DO NOTHING
RETURNING *;
```

If a row is returned, the job is new and should be sent. If no row is returned,
the job was already seen and should be skipped.

Do not add a separate "check if exists" query before insert. That is redundant
and can introduce a race condition.

## Scraper Rules

Each scraper module exports one async function returning `NormalizedJob[]`.

Expected folder shape:

```text
src/scrapers/
  types.ts
  healthJobsUk.ts
  jobsNhsUk.ts
  nhsScotland.ts
  nhsJobsCom.ts
  index.ts
```

Every scraper must:

- Catch its own errors, log them, and return `[]`.
- Produce source-prefixed IDs such as `healthjobsuk:12345`.
- Return normalized fields only.
- Avoid throwing uncaught errors into the main cron cycle.
- Avoid inventing selectors without marking them as unverified.

`job_id` must always include the source prefix so IDs cannot collide across
different sites.

The system cannot literally know about a job at the exact second it is posted
unless a source exposes a real-time webhook/feed. The intended behavior is to
poll every 10 minutes and send new jobs as soon as they are detected.

## WhatsApp Sending Rules

All sends must go through `src/whatsapp/send.ts`. Do not call the Baileys socket
directly from scrapers, database code, or the cron handler.

Any delay/rate-limit logic must preserve jitter. A fixed identical delay for
every message is not acceptable for this project.

The Baileys auth folder, likely `./auth_info/`, must be gitignored and
persisted. Do not delete, move, or regenerate it during normal build/deploy
steps.

## Known Unverified Assumptions

Before implementing scrapers, verify live HTML for all four sources. In
particular:

- Which URL is the correct keyword search URL?
- Which query parameter holds `junior clinical fellow`?
- Does the source return listings in raw HTML, or does it need JavaScript?
- What selectors identify job card, title, link, employer, location, salary,
  closing date, and reference number?
- Is the NHSJobs.com source a searchable board or mostly individual trust job
  pages that need a different strategy?

If live access is unavailable, ask the user to provide saved HTML snippets for
the result pages rather than pretending selectors were tested.

## Commands Expected Eventually

These scripts may not exist yet. Check `package.json` before assuming they do.

```text
npm run dev          # run locally with ts-node/tsx
npm run build        # compile TypeScript
npm start            # run compiled app
npm run scrape:test  # run all scrapers once, no DB writes
npm run db:migrate   # apply Prisma migrations, if Prisma is used
```

## Environment Variables Expected Eventually

```text
DATABASE_URL=
WHATSAPP_GROUP_JID=
SEARCH_KEYWORDS=Clinical Fellow,Junior Clinical Fellow,Clinical Research Fellow,Foundation House officer 1,Foundation House Officer 2,Foundation Year 2,Core Trainee (CT1/2)
SCRAPE_INTERVAL_CRON=*/10 * * * *
LOG_LEVEL=info
```

Use `SEARCH_KEYWORDS`. Do not add broad fallback terms such as `senior`,
`fellow`, or `jcf`. Senior clinical fellow / specialist registrar style titles
should be excluded.

Never commit a populated `.env`. Never log secrets, connection strings, QR
session data, or API credentials.

## Things Not To Do

- Do not suggest the official WhatsApp Cloud API, Twilio WhatsApp API, or Meta
  group APIs as the primary group-send path.
- Do not add Twilio or any paid WhatsApp messaging provider unless the user
  explicitly changes the cost requirement.
- Do not replace the coded implementation with n8n unless the user asks.
- Do not split the system into serverless jobs and a separate sender.
- Do not remove send jitter.
- Do not use check-then-insert dedupe.
- Do not wipe `auth_info/`.
- Do not confidently invent scraper selectors.
- Do not add unrelated frameworks or a frontend dashboard in v1 unless asked.
