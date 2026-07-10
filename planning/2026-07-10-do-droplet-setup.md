# DigitalOcean Droplet Setup Guide for Ear Candy

**Goal:** One-time setup of a DigitalOcean Droplet to host Ear Candy in production. After this setup, GitHub Actions will automatically deploy on every push to `main`.

**Prerequisites:** `doctl` CLI installed and authenticated (`doctl auth init`).

**Estimated cost:** ~$4–6/mo (Basic Droplet) + domain (~$10–15/year).

---

## Step 1: Create the Droplet

```bash
doctl compute droplet create ear-candy \
  --image ubuntu-22-04-x64 \
  --size s-1vcpu-512mb-10gb \
  --region nyc1 \
  --ssh-keys <your-ssh-key-fingerprint> \
  --wait
```

Get the IP:
```bash
DROPLET_IP=$(doctl compute droplet get ear-candy --format PublicIPv4 --no-header)
echo $DROPLET_IP
```

---

## Step 2: Run the Setup Script

The repo includes `scripts/setup-droplet.sh` which handles system updates, Docker, Caddy, and backups:

```bash
ssh root@$DROPLET_IP "bash -s" < scripts/setup-droplet.sh podcast.yourdomain.com $DROPLET_IP
```

What the script does:
- Updates the system
- Installs Docker
- Creates `/opt/ear-candy/data` for persistence
- Installs and configures Caddy for HTTPS
- Sets up a daily backup cron job at 3 AM

---

## Step 3: Configure GitHub Secrets

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

| Secret | Value | How to obtain |
|--------|-------|---------------|
| `SSH_PRIVATE_KEY` | Your SSH private key | `cat ~/.ssh/id_rsa` |
| `DROPLET_IP` | Droplet public IP | `echo $DROPLET_IP` |
| `COOKIE_SECRET` | Random hex string | `openssl rand -hex 32` |
| `ADMIN_PASSWORD_HASH` | Bcrypt hash | `cd server && node -e "const b=require('bcrypt'); b.hash('yourpassword',10).then(h=>console.log(h))"` |
| `GHCR_PAT` | GitHub PAT | GitHub → Settings → Developer settings → Personal access tokens → Generate new token (classic) with `read:packages` scope |

---

## Step 4: Point Your Domain

Create an A record with your DNS provider:
```
podcast.yourdomain.com → $DROPLET_IP
```

Verify:
```bash
dig podcast.yourdomain.com
```

---

## Step 5: Trigger First Deploy

Push to `main` (or the workflow will trigger automatically):
```bash
git push origin main
```

Monitor progress at GitHub → Actions → CI/CD workflow.

---

## What Persists Across Deploys

- SQLite database: `/opt/ear-candy/data/db.sqlite`
- Uploaded audio: `/opt/ear-candy/data/uploads/`

These are mounted as a Docker volume from the host. The container can be stopped, removed, and recreated without data loss.

---

## Backups

Daily at 3 AM to `/opt/ear-candy/backups/`:
- `db_YYYYMMDD_HHMMSS.sqlite` — SQLite backup
- `uploads_YYYYMMDD_HHMMSS.tar.gz` — compressed uploads

14-day retention. To restore:
```bash
ssh root@$DROPLET_IP
cp /opt/ear-candy/backups/db_20250710_030000.sqlite /opt/ear-candy/data/db.sqlite
docker restart ear-candy
```

---

## Troubleshooting

| Issue | Check |
|-------|-------|
| Deploy fails with SSH error | Verify `SSH_PRIVATE_KEY` secret and that the public key is in Droplet's `~/.ssh/authorized_keys` |
| HTTPS doesn't work | Verify DNS A record, check `systemctl status caddy` on Droplet |
| App loads but admin login fails | Regenerate `ADMIN_PASSWORD_HASH` and update GitHub secret |
| Data lost after deploy | Verify volume mount `-v /opt/ear-candy/data:/app/data` in deploy script |
| Health check fails | Check `docker logs ear-candy` on Droplet |
