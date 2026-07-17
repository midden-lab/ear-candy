# Runbook: rotating secrets

Covers `COOKIE_SECRET` and `ADMIN_PASSWORD_HASH` — the two application secrets
injected into the production container. Both are stored as GitHub Secrets
(consumed by the `deploy` job in `.github/workflows/ci-cd.yml`) and are not
persisted anywhere on the Droplet itself outside the running container's
environment.

Rotate either one if it's suspected to have leaked (e.g. accidentally logged,
pasted somewhere public, or a laptop with local access to it is lost/stolen).
There's no scheduled/automatic rotation — this is a manual, on-demand
procedure (see issue #6 for why that's an acceptable scope for a
single-admin MVP).

## Rotating `COOKIE_SECRET`

This is the HMAC key `@fastify/cookie` uses to sign the `admin_session`
cookie (`server/src/app.ts`). Rotating it immediately invalidates every
existing session — **you will be logged out too**, along with anyone else
signed in. That's expected, not a bug.

1. Generate a new secret:
   ```bash
   openssl rand -hex 32
   ```
2. Update the GitHub Secret so the next deploy picks it up:
   ```bash
   gh secret set COOKIE_SECRET --repo <owner>/ear-candy
   # paste the new value when prompted, or pipe it in:
   openssl rand -hex 32 | gh secret set COOKIE_SECRET --repo <owner>/ear-candy
   ```
3. Trigger a deploy (push to `main`, or re-run the `deploy` job of the most
   recent successful `main` CI/CD run) — the new container picks up the
   updated secret via `DEPLOY_COOKIE_SECRET` in the `deploy` job's `env:`
   block.
4. Verify: log into the admin panel with your existing admin password. A
   fresh login should succeed and issue a new, validly-signed cookie.

## Rotating `ADMIN_PASSWORD_HASH` (changing the admin password)

There is no in-app "change password" flow (see CLAUDE.md gotcha #10) — this
is done by generating a new bcrypt hash and redeploying with it.

1. Generate a new hash for the new password:
   ```bash
   ./scripts/hash-password.sh '<new-password>'
   ```
2. Update the GitHub Secret:
   ```bash
   ./scripts/hash-password.sh '<new-password>' | gh secret set ADMIN_PASSWORD_HASH --repo <owner>/ear-candy
   ```
3. Trigger a deploy, same as above.
4. Verify: log into the admin panel with the **new** password. The old
   password should now fail with `401 Invalid password`.

## If you need to rotate outside of a normal deploy (droplet is unreachable via CI, or you need it live *right now*)

Both secrets are passed to the production container purely as environment
variables at `docker run` time (`deploy` job, `.github/workflows/ci-cd.yml`)
— there's no separate env file on the Droplet to edit. Manual intervention
means re-running the same `docker run` invocation by hand over SSH with the
new values:

```bash
ssh earcandy
docker stop ear-candy && docker rm ear-candy
docker run -d \
  --name ear-candy \
  --restart unless-stopped \
  --log-driver json-file --log-opt max-size=10m --log-opt max-file=3 \
  -p 3000:3000 \
  -v /opt/ear-candy/data:/app/data \
  -e NODE_ENV=production \
  -e SERVE_CLIENT=true \
  -e PORT=3000 \
  -e COOKIE_SECRET='<new-secret>' \
  -e ADMIN_PASSWORD_HASH='<new-hash>' \
  <the currently-deployed image, e.g. ghcr.io/<owner>/ear-candy@sha256:...>
```

Use single quotes around the secret values — bcrypt hashes contain `$`
characters that bash will otherwise try to expand (see CLAUDE.md gotcha
#36). Still update the GitHub Secret afterward too, or the next automated
deploy will silently roll the container back to the old value.

## Other secrets (rotate the same way, via `gh secret set`, no app restart needed)

- `GHCR_PAT` — used only by CI to push/pull images from GHCR. Rotating it
  doesn't affect the running production container, only future CI runs.
- `SSH_PRIVATE_KEY` — used only by the `deploy`/`verify-production` jobs to
  reach the Droplet. Rotating it means updating the corresponding public
  key in the Droplet's `~/.ssh/authorized_keys` first, or CI will lose
  deploy access.
- `DROPLET_IP` — not a credential, but update it here too if the Droplet is
  ever recreated with a new address.
