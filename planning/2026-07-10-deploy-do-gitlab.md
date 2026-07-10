# Deploy Ear Candy to DigitalOcean via GitHub Actions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up automated deployment of Ear Candy to a DigitalOcean Droplet using GitHub Actions. Pushing to `main` triggers a build, pushes the image to GitHub Container Registry (GHCR), SSHs into the Droplet, pulls the latest image, and restarts the production stack with zero downtime.

**Architecture:** GitHub Actions workflow builds the multi-stage `Dockerfile`, pushes to GHCR, then deploys via SSH to a DigitalOcean Droplet running Docker. The Droplet uses the root `Dockerfile` (single-container, server serves built client on port 3000) with a Caddy reverse proxy for HTTPS.

**Estimated cost:** ~$4–6/mo (Basic Droplet) + domain (~$10–15/year). GHCR is free for public repos, generous for private.

---

## Prerequisites

Before implementing this plan, you need:

1. A GitHub repository with this codebase pushed to it.
2. A DigitalOcean account and a Droplet created (Ubuntu 22.04+ recommended).
3. A domain name (or subdomain) pointing to your Droplet's IP address.
4. An `ADMIN_PASSWORD_HASH` generated via `./scripts/hash-password.sh` or `bcrypt.hash()`.
5. A `COOKIE_SECRET` — a long random string (e.g., `openssl rand -hex 32`).

---

## Phase 1 — Droplet Setup (One-Time)

### Task 1: Provision and configure the DigitalOcean Droplet

**Files:**
- None (infrastructure setup)

- [ ] **Step 1: Create a Basic Droplet**

  In DigitalOcean, create a Droplet with:
  - **Image:** Ubuntu 22.04 (LTS) x64
  - **Plan:** Basic — $4/mo (s-1vcpu-512mb-10gb) or $6/mo (s-1vcpu-1gb)
  - **Datacenter:** Pick one close to your audience
  - **Authentication:** SSH key (recommended) or password
  - **Hostname:** `ear-candy` (or your subdomain, e.g., `podcast.yourdomain.com`)

  Expected: Droplet boots in ~1 minute. Note the public IP.

- [ ] **Step 2: Point your domain to the Droplet**

  Create an A record:
  - `podcast.yourdomain.com` → `<droplet-ip>`

  Expected: DNS propagation takes a few minutes to hours. Verify with `dig podcast.yourdomain.com`.

- [ ] **Step 3: SSH into the Droplet and install Docker**

  ```bash
  ssh root@<droplet-ip>
  ```

  ```bash
  # Update system
  apt update && apt upgrade -y

  # Install Docker
  curl -fsSL https://get.docker.com | sh

  # Add user to docker group (if not root)
  usermod -aG docker $USER

  # Verify
  docker --version
  docker compose version
  ```

  Expected: Docker 24.x+ and Docker Compose v2.x installed.

- [ ] **Step 4: Create the data directory for persistence**

  ```bash
  mkdir -p /opt/ear-candy/data
  ```

  Expected: Directory exists at `/opt/ear-candy/data`.

- [ ] **Step 5: Install Caddy for HTTPS reverse proxy**

  ```bash
  apt install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt update
  apt install -y caddy
  ```

  Expected: `caddy version` prints the version.

- [ ] **Step 6: Configure Caddy**

  Create `/etc/caddy/Caddyfile`:

  ```
  podcast.yourdomain.com {
    reverse_proxy localhost:3000
  }
  ```

  Replace `podcast.yourdomain.com` with your actual domain.

  ```bash
  systemctl reload caddy
  ```

  Expected: Caddy obtains a Let's Encrypt certificate automatically. Visit `https://podcast.yourdomain.com` — you should see a blank page or connection error (Ear Candy isn't running yet), but HTTPS should work.

---

## Phase 2 — GitHub Actions Pipeline

### Task 2: Create the GitHub Actions workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create `.github/workflows/deploy.yml`**

  ```yaml
  name: Build and Deploy to DigitalOcean

  on:
    push:
      branches: [main]

  env:
    REGISTRY: ghcr.io
    IMAGE_NAME: ${{ github.repository }}

  jobs:
    build:
      runs-on: ubuntu-latest
      permissions:
        contents: read
        packages: write
      steps:
        - name: Checkout
          uses: actions/checkout@v4

        - name: Set up Docker Buildx
          uses: docker/setup-buildx-action@v3

        - name: Log in to GHCR
          uses: docker/login-action@v3
          with:
            registry: ${{ env.REGISTRY }}
            username: ${{ github.actor }}
            password: ${{ secrets.GITHUB_TOKEN }}

        - name: Extract metadata
          id: meta
          uses: docker/metadata-action@v5
          with:
            images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
            tags: |
              type=sha,prefix=,suffix=
              type=raw,value=latest

        - name: Build and push image
          uses: docker/build-push-action@v5
          with:
            context: .
            push: true
            tags: ${{ steps.meta.outputs.tags }}
            labels: ${{ steps.meta.outputs.labels }}
            cache-from: type=gha
            cache-to: type=gha,mode=max

    deploy:
      needs: build
      runs-on: ubuntu-latest
      steps:
        - name: Deploy to Droplet via SSH
          uses: appleboy/ssh-action@v1.0.3
          with:
            host: ${{ secrets.DROPLET_IP }}
            username: root
            key: ${{ secrets.SSH_PRIVATE_KEY }}
            script: |
              set -e
              IMAGE="${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest"
              echo "Pulling image: $IMAGE"

              # Log in to GHCR on the Droplet
              echo "${{ secrets.GHCR_PAT }}" | docker login ${{ env.REGISTRY }} -u ${{ github.actor }} --password-stdin

              docker pull $IMAGE

              echo "Stopping old container..."
              docker stop ear-candy || true
              docker rm ear-candy || true

              echo "Starting new container..."
              docker run -d \
                --name ear-candy \
                --restart unless-stopped \
                -p 3000:3000 \
                -v /opt/ear-candy/data:/app/data \
                -e NODE_ENV=production \
                -e SERVE_CLIENT=true \
                -e PORT=3000 \
                -e COOKIE_SECRET="${{ secrets.COOKIE_SECRET }}" \
                -e ADMIN_PASSWORD_HASH="${{ secrets.ADMIN_PASSWORD_HASH }}" \
                $IMAGE

              echo "Pruning old images..."
              docker image prune -af --filter "until=168h" || true
  ```

  Expected: File created at `.github/workflows/deploy.yml`.

- [ ] **Step 2: Commit the workflow file**

  ```bash
  git add .github/workflows/deploy.yml
  git commit -m "ci: add GitHub Actions workflow for DO deployment"
  git push origin main
  ```

---

## Phase 3 — GitHub Secrets

### Task 3: Configure GitHub repository secrets

**Files:**
- None (GitHub web UI configuration)

Navigate to your GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

Add the following secrets:

| Secret | Description | How to obtain |
|--------|-------------|---------------|
| `SSH_PRIVATE_KEY` | Private key for SSH access to the Droplet | `cat ~/.ssh/id_rsa` (the key you added to DO) |
| `DROPLET_IP` | Droplet's public IP address | DigitalOcean dashboard |
| `GHCR_PAT` | GitHub Personal Access Token with `read:packages` scope | GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) |
| `COOKIE_SECRET` | Secret for signing session cookies | `openssl rand -hex 32` |
| `ADMIN_PASSWORD_HASH` | Bcrypt hash of admin password | `./scripts/hash-password.sh yourpassword` |

- [ ] **Step 1: Add `SSH_PRIVATE_KEY`**

  - Name: `SSH_PRIVATE_KEY`
  - Value: contents of your private SSH key

- [ ] **Step 2: Add `DROPLET_IP`**

  - Name: `DROPLET_IP`
  - Value: your Droplet's public IP

- [ ] **Step 3: Add `GHCR_PAT`**

  - Name: `GHCR_PAT`
  - Value: a GitHub Personal Access Token with at least `read:packages` scope

  Why: The Droplet needs this to pull images from GHCR. `GITHUB_TOKEN` is only valid within the workflow; the Droplet needs its own PAT.

- [ ] **Step 4: Add `COOKIE_SECRET`**

  - Name: `COOKIE_SECRET`
  - Value: a long random hex string

- [ ] **Step 5: Add `ADMIN_PASSWORD_HASH`**

  - Name: `ADMIN_PASSWORD_HASH`
  - Value: the bcrypt hash of your admin password

Expected: All 5 secrets appear in the GitHub repository secrets list.

---

## Phase 4 — First Deploy

### Task 4: Trigger the workflow and verify

- [ ] **Step 1: Push to main or trigger workflow manually**

  If you already pushed `.github/workflows/deploy.yml`, the workflow should have started automatically. Otherwise:

  ```bash
  git push origin main
  ```

  Expected: GitHub → Actions shows a new workflow run with "build" and "deploy" jobs.

- [ ] **Step 2: Monitor the build job**

  In GitHub, click the running workflow → **build** job.

  Expected output:
  - Docker Buildx set up
  - GHCR login succeeds
  - `docker build` completes (may take 2–5 minutes)
  - Image pushed to `ghcr.io/<owner>/<repo>:<sha>` and `:latest`
  - Job status: **success**

- [ ] **Step 3: Monitor the deploy job**

  In GitHub, click the **deploy** job.

  Expected output:
  - SSH connection established
  - GHCR login on Droplet succeeds
  - `docker pull` succeeds
  - Old container stopped and removed
  - New container started
  - Job status: **success**

- [ ] **Step 4: Verify the app is running**

  On the Droplet:

  ```bash
  docker ps
  ```

  Expected: `ear-candy` container is running, mapped to port 3000.

  ```bash
  curl -s http://localhost:3000 | head -20
  ```

  Expected: Returns HTML (the React app's `index.html`).

- [ ] **Step 5: Verify HTTPS via browser**

  Visit `https://podcast.yourdomain.com`.

  Expected: Ear Candy loads. The initial podcast name is "My Podcast" (default settings). Click the gear icon → admin login → enter your password → manage episodes.

- [ ] **Step 6: Verify data persistence**

  In the admin panel, create a season and an episode. Then:

  ```bash
  ssh root@<droplet-ip> "ls -la /opt/ear-candy/data"
  ```

  Expected: `db.sqlite`, `db.sqlite-wal`, `uploads/` exist.

  Restart the container:

  ```bash
  ssh root@<droplet-ip> "docker restart ear-candy"
  ```

  Refresh the browser. Expected: your season and episode are still there.

---

## Phase 5 — Backup Strategy (Recommended)

### Task 5: Automate SQLite backups

- [ ] **Step 1: Create a backup script on the Droplet**

  ```bash
  ssh root@<droplet-ip> "cat > /opt/ear-candy/backup.sh << 'EOF'
  #!/bin/bash
  set -e
  BACKUP_DIR=/opt/ear-candy/backups
  mkdir -p $BACKUP_DIR
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  sqlite3 /opt/ear-candy/data/db.sqlite ".backup '$BACKUP_DIR/db_$TIMESTAMP.sqlite'"
  tar czf $BACKUP_DIR/uploads_$TIMESTAMP.tar.gz -C /opt/ear-candy/data uploads
  # Keep only last 14 days
  find $BACKUP_DIR -name '*.sqlite' -mtime +14 -delete
  find $BACKUP_DIR -name '*.tar.gz' -mtime +14 -delete
  EOF
  chmod +x /opt/ear-candy/backup.sh"
  ```

- [ ] **Step 2: Add a cron job**

  ```bash
  ssh root@<droplet-ip> "crontab -l 2>/dev/null; echo '0 3 * * * /opt/ear-candy/backup.sh' | crontab -"
  ```

  Expected: Daily backups at 3 AM. Files stored in `/opt/ear-candy/backups/`.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-----------|-----|
| Build fails with GHCR login error | `GITHUB_TOKEN` missing or no `packages: write` permission | Ensure `permissions: packages: write` is set in the workflow. |
| Deploy fails with SSH permission denied | Wrong SSH key or Droplet doesn't have the public key | Add the correct public key to `~/.ssh/authorized_keys` on the Droplet. |
| Deploy fails with "docker login denied" | `GHCR_PAT` is invalid or lacks `read:packages` | Generate a new PAT with `read:packages` scope. |
| Deploy fails with "docker command not found" | Docker not installed on Droplet | Re-run Phase 1, Step 3. |
| App loads but admin login fails | Wrong `ADMIN_PASSWORD_HASH` | Regenerate hash and update GitHub secret. |
| HTTPS doesn't work | Caddy not running or domain not pointing to Droplet | Check `systemctl status caddy`, verify DNS A record. |
| Data lost after deploy | Volume not mounted correctly | Verify `-v /opt/ear-candy/data:/app/data` in deploy script. |

---

## Cost Breakdown

| Item | Monthly Cost |
|------|-------------|
| DigitalOcean Basic Droplet (512MB) | $4.00 |
| Domain (optional, e.g., Namecheap) | ~$1.00–$1.25/mo |
| GHCR storage & egress | Free for public repos; generous for private |
| **Total** | **~$5–5.25/mo** |

If you need more RAM, the $6/mo (1GB) Droplet is the next step.

---

## Future Improvements

- **Blue-green deploy:** Instead of `docker stop` + `docker run`, use two containers and swap ports to eliminate brief downtime.
- **Health check:** Add a `curl` health check before marking deploy as successful.
- **Rollback:** Tag the previous image before deploying, so `docker pull $PREVIOUS_IMAGE` can revert quickly.
- **Monitoring:** Add Uptime Kuma or DO Monitoring alerts for the Droplet.
