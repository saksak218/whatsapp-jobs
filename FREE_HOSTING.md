# Free Always-On Hosting

Vercel is not suitable for WhatsApp sending with Baileys because Vercel Functions
are short-lived and the filesystem is read-only except for temporary scratch
space. This app needs:

- a long-running Node process
- a persistent `auth_info` folder for WhatsApp session files
- outbound HTTPS/websocket access

The most reliable free setup is an Oracle Cloud Always Free Ubuntu VM with PM2
and PostgreSQL on that same VM. A hosted free database can suspend or exhaust a
monthly compute allowance; local PostgreSQL has no separate compute meter and
keeps the two-minute polling schedule practical.

## 1. Create the VM

1. Create an Oracle Cloud Free Tier account.
2. Create an Always Free Ubuntu instance.
3. Add your SSH key.
4. SSH into the instance.

## 2. Install Node, Git, and PM2

```bash
sudo apt update
sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

## 3. Upload or clone the app

```bash
sudo mkdir -p /opt/nhs-jobs
sudo chown -R "$USER":"$USER" /opt/nhs-jobs
git clone YOUR_REPO_URL /opt/nhs-jobs
cd /opt/nhs-jobs
```

If you do not use GitHub, upload this folder to `/opt/nhs-jobs` with SFTP.

## 4. Install local PostgreSQL

```bash
sudo apt update
sudo apt install -y postgresql postgresql-client
sudo systemctl enable --now postgresql
sudo -u postgres psql
```

At the `postgres=#` prompt, create a dedicated least-privilege role and database:

```sql
CREATE USER nhs_jobs;
\password nhs_jobs
CREATE DATABASE nhs_jobs OWNER nhs_jobs;
\q
```

The `\password` command prompts securely. Use a long password containing only
letters and digits so it can be placed in a connection URL without percent
encoding. PostgreSQL remains bound to localhost by default; do not open port
5432 in the Oracle firewall or security list.

## 5. Configure environment

```bash
cp .env-example .env
nano .env
```

Use these important values:

```env
DATABASE_URL=postgresql://nhs_jobs:YOUR_PASSWORD@127.0.0.1:5432/nhs_jobs
DATABASE_SSL=auto
DB_CONNECT_TIMEOUT_SECONDS=30
WHATSAPP_GROUP_JID=120363xxxxxxxxxxxx@g.us
WHATSAPP_AUTH_DIR=/opt/nhs-jobs/auth_info
DRY_RUN_SENDS=false
DISABLE_WHATSAPP_SENDS=false
SCRAPE_INTERVAL_CRON=*/2 * * * *
```

If you do not know the group JID yet, set `WHATSAPP_GROUP_NAME` instead, start
the app once, then run `npm run whatsapp:groups` after pairing.

To sanity-check the database URL on the VM without exposing the secret, run:

```bash
grep '^DATABASE_URL=' .env
```

You should see the `DATABASE_URL=` line present. If you want to confirm the
value is not empty, use:

```bash
test -n "$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" && echo OK
```

## 6. Build and migrate

```bash
npm ci
npm run build
npm run db:migrate
```

### Safe cutover from an unavailable hosted database

Stop the worker before changing `DATABASE_URL`:

```bash
pm2 stop nhs-jobs-alerts
```

If the old database is unavailable and cannot be exported, initialize the local
database as above and baseline every vacancy that is already live before the
worker is restarted:

```bash
npm run listings:baseline
```

This records current listings in the suppression ledger so they are not all
announced as new. Jobs first discovered after the baseline will be delivered
normally. If the old database becomes available, prefer migrating it with
`pg_dump`/`pg_restore` instead so pending and sent history is retained.

If the outage start time is known, preview and then selectively queue only
eligible listings with a real posted date on or after that time:

```bash
npm run suppressed:replay -- --since=2026-09-17T00:00:00Z
npm run suppressed:replay -- --since=2026-09-17T00:00:00Z --confirm
```

The first command is read-only. Review its candidate list before running the
confirmed command. Confirmed candidates remain pending for the running worker,
which sends and marks them through the normal delivery path.

## 7. Start the worker

```bash
pm2 start ecosystem.config.cjs
pm2 logs nhs-jobs-alerts
```

Scan the QR code shown in the logs using WhatsApp on your phone. Keep the bot
number joined to the target group.

## 8. Keep it running after reboot

```bash
pm2 save
pm2 startup
```

Run the command PM2 prints after `pm2 startup`.

## Useful commands

```bash
pm2 status
pm2 logs nhs-jobs-alerts
pm2 restart nhs-jobs-alerts
pm2 stop nhs-jobs-alerts
```

## Updating

```bash
cd /opt/nhs-jobs
git pull
npm ci
npm run build
pm2 restart nhs-jobs-alerts
```

## Database backups

The database is small but contains the deduplication and pending-delivery
state. Back it up regularly and keep at least one copy outside the VM:

```bash
mkdir -p "$HOME/nhs-jobs-backups"
nhs_jobs_database_url="$(sed -n 's/^DATABASE_URL=//p' .env)"
pg_dump --format=custom "$nhs_jobs_database_url" \
  > "$HOME/nhs-jobs-backups/nhs-jobs-$(date +%F).dump"
unset nhs_jobs_database_url
```

Oracle Always Free also includes a limited number of block-volume backups. A
volume backup protects against VM loss; `pg_dump` is the portable database copy.

## Managed free alternative

If maintaining PostgreSQL on the VM is undesirable, Aiven's free PostgreSQL
plan is the strongest current managed fallback: it has 1 GB storage, backups,
and no fixed expiry. It is single-node, has a 20-connection limit, no SLA, and
may be powered off after sustained inactivity. This app uses at most five
connections and polls continuously, so it fits those limits. Use Aiven's
connection URL and set `DATABASE_SSL=require`. Local PostgreSQL remains the
recommended option because it removes another provider and quota from the
delivery path.
