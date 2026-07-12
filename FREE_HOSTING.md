# Free Always-On Hosting

Vercel is not suitable for WhatsApp sending with Baileys because Vercel Functions
are short-lived and the filesystem is read-only except for temporary scratch
space. This app needs:

- a long-running Node process
- a persistent `auth_info` folder for WhatsApp session files
- outbound HTTPS/websocket access

The most realistic free setup is an Oracle Cloud Always Free Ubuntu VM with PM2.

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

## 4. Configure environment

```bash
cp .env-example .env
nano .env
```

Use these important values:

```env
DATABASE_URL=postgres://...
WHATSAPP_GROUP_JID=120363xxxxxxxxxxxx@g.us
WHATSAPP_AUTH_DIR=/opt/nhs-jobs/auth_info
DRY_RUN_SENDS=false
DISABLE_WHATSAPP_SENDS=false
SCRAPE_INTERVAL_CRON=*/10 * * * *
```

If you do not know the group JID yet, set `WHATSAPP_GROUP_NAME` instead, start
the app once, then run `npm run whatsapp:groups` after pairing.

## 5. Build and migrate

```bash
npm ci
npm run build
npm run db:migrate
```

## 6. Start the worker

```bash
pm2 start ecosystem.config.cjs
pm2 logs nhs-jobs-alerts
```

Scan the QR code shown in the logs using WhatsApp on your phone. Keep the bot
number joined to the target group.

## 7. Keep it running after reboot

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
