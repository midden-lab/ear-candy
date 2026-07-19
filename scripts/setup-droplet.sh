#!/bin/bash
set -e

# Ear Candy — DigitalOcean Droplet Setup Script
# Run this on a fresh Ubuntu 22.04+ Droplet via SSH

DOMAIN="${1:?Usage: $0 <domain> <droplet-ip>}"
DROPLET_IP="${2:-$(curl -s ifconfig.me)}"

echo "=== Setting up Ear Candy on DigitalOcean ==="
echo "Domain: $DOMAIN"
echo "Droplet IP: $DROPLET_IP"

# --- Step 1: System updates ---
echo "Updating system..."
apt update && apt upgrade -y

# --- Step 2: Install Docker ---
echo "Installing Docker..."
curl -fsSL https://get.docker.com | sh
usermod -aG docker root
docker --version

# --- Step 3: Create data directory ---
echo "Creating data directory..."
mkdir -p /opt/ear-candy/data/uploads
# uid/gid 1000 matches the non-root `node` user the production image runs
# as (issue #36) — the deploy job also re-asserts this on every deploy,
# but setting it correctly here means a fresh droplet's first deploy
# doesn't depend on that being the very first thing that touches this
# directory.
chown -R 1000:1000 /opt/ear-candy/data

# --- Step 4: Install Caddy ---
echo "Installing Caddy..."
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install -y caddy

# --- Step 5: Configure Caddy ---
# Rendered from the checked-in template (infra/Caddyfile.template), not an
# inline heredoc — that template is the single source of truth for what
# Caddy should look like, so a manual live edit on the Droplet has
# something to diff against instead of silently drifting (issue #58, #44).
echo "Configuring Caddy for $DOMAIN..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sed "s/__DOMAIN__/$DOMAIN/" "$SCRIPT_DIR/../infra/Caddyfile.template" > /etc/caddy/Caddyfile
systemctl reload caddy

# --- Step 6: Setup backup script ---
echo "Setting up backup script..."
cat > /opt/ear-candy/backup.sh << 'EOF'
#!/bin/bash
set -e
BACKUP_DIR=/opt/ear-candy/backups
mkdir -p $BACKUP_DIR
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
if [ -f /opt/ear-candy/data/db.sqlite ]; then
  sqlite3 /opt/ear-candy/data/db.sqlite ".backup '$BACKUP_DIR/db_$TIMESTAMP.sqlite'"
fi
if [ -d /opt/ear-candy/data/uploads ]; then
  tar czf $BACKUP_DIR/uploads_$TIMESTAMP.tar.gz -C /opt/ear-candy/data uploads
fi
find $BACKUP_DIR -name '*.sqlite' -mtime +14 -delete
find $BACKUP_DIR -name '*.tar.gz' -mtime +14 -delete
EOF
chmod +x /opt/ear-candy/backup.sh

# Add cron job
echo "Adding daily backup cron job..."
(crontab -l 2>/dev/null || true; echo "0 3 * * * /opt/ear-candy/backup.sh") | crontab -

echo ""
echo "=== Droplet setup complete ==="
echo ""
echo "Next steps:"
echo "1. Add your SSH public key to ~/.ssh/authorized_keys if not already done"
echo "2. Create GitHub secrets: DROPLET_IP=$DROPLET_IP"
echo "3. Generate COOKIE_SECRET: openssl rand -hex 32"
echo "4. Generate ADMIN_PASSWORD_HASH: ./scripts/hash-password.sh <password>"
echo "5. Create GHCR_PAT: GitHub Settings -> Developer settings -> Personal access tokens"
echo "6. Push to main to trigger the first deploy"
echo ""
echo "Visit https://$DOMAIN after the first deploy."
