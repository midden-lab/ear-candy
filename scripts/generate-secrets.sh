#!/bin/bash
set -e

# generate-secrets.sh — Generate secrets for Ear Candy GitHub Actions
# Run this locally, then add the output values to GitHub repo secrets.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=== Ear Candy Secret Generator ==="
echo ""

# --- SSH Private Key ---
SSH_KEY="${HOME}/.ssh/ear_candy_key"
if [[ ! -f "$SSH_KEY" ]]; then
    echo "ERROR: SSH private key not found at $SSH_KEY"
    echo "Generate one with: ssh-keygen -t ed25519 -f ~/.ssh/ear_candy_key -C ear-candy-deploy"
    exit 1
fi
echo "--- SSH_PRIVATE_KEY ---"
cat "$SSH_KEY"
echo ""

# --- DROPLET_IP ---
echo "--- DROPLET_IP ---"
doctl compute droplet get ear-candy --format PublicIPv4 --no-header 2>/dev/null || echo "ERROR: Could not get droplet IP. Is doctl authenticated and the droplet created?"
echo ""

# --- COOKIE_SECRET ---
echo "--- COOKIE_SECRET ---"
openssl rand -hex 32
echo ""

# --- ADMIN_PASSWORD_HASH ---
echo "--- ADMIN_PASSWORD_HASH ---"
read -rsp "Enter admin password to hash: " ADMIN_PASS
echo ""
cd "${REPO_ROOT}/server"
node -e "const b=require('bcrypt'); b.hash('$ADMIN_PASS',10).then(h=>console.log(h))"
echo ""

# --- GHCR_PAT ---
echo "--- GHCR_PAT ---"
echo "Create this manually at: https://github.com/settings/tokens"
echo "Required scopes: read:packages, write:packages, delete:packages"
echo "Paste the token value below when you have it:"
read -rsp "GHCR_PAT: " GHCR_PAT
echo ""
echo "$GHCR_PAT"
echo ""

echo "=== Done ==="
echo "Add all values above to: https://github.com/midden-lab/ear-candy/settings/secrets/actions"
