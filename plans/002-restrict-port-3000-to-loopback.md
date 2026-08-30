---
id: restrict-port-3000-to-loopback
title: "Restrict production port 3000 to loopback-only (fixes issue #81)"
status: complete
priority: 1
created: 2026-08-30
steps_completed: 5
steps_total: 5
tags: [security, deploy-config, ci-cd]
---

# Restrict production port 3000 to loopback-only

## Summary

Fixes [issue #81](https://github.com/midden-lab/ear-candy/issues/81): the production Droplet's app container currently publishes port 3000 to all interfaces (`-p 3000:3000`), making it directly reachable over plain HTTP from the public internet and completely bypassing Caddy's TLS termination. Binding the publish to loopback only (`-p 127.0.0.1:3000:3000`) closes this while requiring zero changes to Caddy itself, since Caddy already reverse-proxies via `localhost:3000` from the same host.

## Context

**Confirmed live, right now** (verified this session, not just trusting the 6-week-old issue report): `curl http://203.0.113.10:3000/api/health` returns a real `200 OK` in plain HTTP.

**Root cause:** `docker run -p 3000:3000` with no host IP specified publishes to `0.0.0.0` by default. This appears in `.github/workflows/ci-cd.yml`'s `deploy` job (the one that actually matters — this is what runs on every push to `main`) and in `docker-compose.prod.yml` (the "convenient local/manual equivalent" per `README.md` — CLAUDE.md gotcha #35 establishes the existing convention of keeping this file's config in sync with the `deploy` job even though it isn't what's actually deployed).

**Why the loopback-bind fix, not a firewall rule** (the issue itself proposed both, undecided — this is now decided, don't re-litigate it): SSH'd into the Droplet directly this session and confirmed (a) `ufw` is installed but inactive — no host firewall currently enforced at all, and (b) `iptables -L -n` shows Docker's own auto-inserted `DOCKER` chain explicitly `ACCEPT`ing `tcp dpt:3000` from `0.0.0.0/0` — this is Docker's standard behavior for any unbound port publish, and it means a plain `ufw` rule would **not** actually block this even if enabled (Docker's own iptables chains are processed independently of ufw's; blocking Docker-published ports via ufw needs the separate `ufw-docker` project or manual `DOCKER-USER` rules — real added complexity and a real footgun if half-configured). Also confirmed `/etc/caddy/Caddyfile` on the Droplet is exactly:
```
earcandy.example.com {
  reverse_proxy localhost:3000
}
```
Caddy runs on the host itself (not containerized) and connects via `localhost:3000` — loopback traffic. Binding the Docker publish to `127.0.0.1:3000:3000` blocks all non-loopback access at the kernel/Docker level while leaving Caddy's own connection completely unaffected. No Caddy config change needed.

**What this does NOT require changing:** the app's own internal listen address (`server/src/server.ts`'s `app.listen({ port, host: '0.0.0.0' })`) stays as-is — `0.0.0.0` there means "listen on all interfaces *inside the container's own network namespace*," which is normal and required for Docker's port-forwarding to reach it at all. The fix is entirely at the **host-side publish** layer (the `-p` flag), not the app's own bind address. Don't touch `server.ts`.

**Explicitly out of scope:** `ci-cd.yml` has a *third* occurrence of `-p 3000:3000`, in the `e2e` job's "Start test container" step (~line 227), starting the ephemeral `ear-candy-test` container used only for automated Playwright runs inside the GitHub Actions runner. The step's own existing comment already documents why this one doesn't need fixing: *"The ear-candy-test container is ephemeral and only reachable from this runner"* — it's never exposed to the real internet and is destroyed at the end of the job. Do not change this occurrence; changing it risks breaking e2e for zero security benefit.

**Deployment path** (this repo's established convention — see CLAUDE.md's Branching & Workflow section, and this session's own prior work in `plans/001-first-party-analytics.md`): work happens on a branch off `dev`, PR into `dev`, merge. A **separate** `dev` → `main` promotion PR (squash-merge) is what actually triggers a real deploy — the `deploy` job only fires on a push to `main`. `dev` and `main` are currently in sync, so branching off either is equivalent right now, but branch off `dev` per convention.

## Steps

### Step 1: Bind the deploy job's Docker publish to loopback

**Files:** `.github/workflows/ci-cd.yml`
**Requires review:** true — this is the actual production-reachability change; treat it with the same care as any change to how the internet reaches production.

In the `deploy` job's `docker run -d \` invocation (the one under `--name ear-candy`, ~line 400 — **not** the `e2e` job's `--name ear-candy-test` invocation at ~line 227, which stays untouched per Context above), change:
```
              -p 3000:3000 \
```
to:
```
              -p 127.0.0.1:3000:3000 \
```
Add a short comment immediately above the line (matching this job's existing dense-comment style — see the `TRUSTED_PROXY_IPS` comment a few lines above as the pattern to match) explaining: loopback-only because Caddy reverse-proxies via `localhost:3000` from the same host (not containerized) and there's no reason for the app to be reachable on any other interface; fixes issue #81.

**Acceptance criteria:**
- [ ] The `deploy` job's `docker run` now reads `-p 127.0.0.1:3000:3000 \`
- [ ] The `e2e` job's `docker run` (test container) is unchanged, still `-p 3000:3000 \`
- [ ] A comment explaining the loopback binding and linking to issue #81 is present directly above the changed line

---

### Step 2: Match the same binding in docker-compose.prod.yml

**Files:** `docker-compose.prod.yml`
**Requires review:** false (mechanical consistency change, not itself a new production-reachability decision — Step 1 is where that decision lives)

Change the `ports:` entry from:
```yaml
    ports:
      - "3000:3000"
```
to:
```yaml
    ports:
      - "127.0.0.1:3000:3000"
```
Add a one-line comment above it noting this mirrors the `deploy` job's binding in `ci-cd.yml` (issue #81) — keeps this file's existing "kept in sync with the deploy job" convention (CLAUDE.md gotcha #35) intact rather than letting it drift.

**Acceptance criteria:**
- [ ] `docker compose -f docker-compose.prod.yml config` (with dummy `COOKIE_SECRET`/`ADMIN_PASSWORD_HASH` env vars set) parses successfully and shows the port mapping as `127.0.0.1:3000:3000`

---

### Step 3: Validate both files statically before opening a PR

**Files:** none (verification only)
**Requires review:** false

Since this can't be fully verified without a live deploy (that's Step 5), catch what can be caught locally first:
1. YAML-validate `.github/workflows/ci-cd.yml` (e.g. `ruby -ryaml -e "YAML.load_file('.github/workflows/ci-cd.yml')"` — this repo has no local Python/yaml tooling assumed present, Ruby's YAML lib ships with macOS and was used for this exact purpose in this session's prior deploy-config work).
2. `docker compose -f docker-compose.prod.yml config` as described in Step 2's acceptance criteria.
3. Confirm via `grep -n '3000:3000' .github/workflows/ci-cd.yml` that exactly one of the three occurrences now reads `127.0.0.1:3000:3000` (the `deploy` job's) and the other two (`e2e` job's test container) are untouched.

**Acceptance criteria:**
- [ ] Both files parse without error
- [ ] The `grep` check confirms exactly one occurrence changed, and it's the correct one

---

### Step 4: Open PR into `dev`, merge, then open the `dev` → `main` promotion PR

**Files:** none (process step)
**Requires review:** false (the review gate that matters is Step 1's change itself and Step 5's live verification — this step is just following the repo's existing, already-established promotion process)

1. Branch off `dev` (e.g. `fix/restrict-port-3000-loopback`), commit Steps 1-2's changes, push, open a PR into `dev` referencing issue #81.
2. Once its CI passes and it's merged into `dev`, open a second PR promoting `dev` → `main` (per this repo's standard two-PR path — see Context above). This second PR is the one that actually triggers a real deploy once merged.

**Acceptance criteria:**
- [ ] PR into `dev` merged, referencing issue #81
- [ ] `dev` → `main` promotion PR opened and its own pre-merge CI (`lint`/`test`/`typecheck`/`build`/`e2e`) passes before merging

---

### Step 5: Live post-deploy verification

**Files:** none (verification only, against the running production Droplet)
**Requires review:** true — this step confirms (or fails to confirm) that production's actual internet-facing reachability changed as intended; do not consider issue #81 resolved without this.

After the promotion PR merges and the `deploy`/`verify-production` jobs complete successfully:

1. From a machine that is **not** the Droplet itself, re-run the exact check that discovered the bug — it must now fail to connect (connection refused or timeout), not return `200`:
   ```bash
   curl -m 10 http://<droplet-ip-or-domain>:3000/api/health
   ```
2. From **on** the Droplet itself (e.g. via SSH), confirm the app is still reachable on loopback — proves Caddy's `reverse_proxy localhost:3000` path still works:
   ```bash
   curl -sf http://localhost:3000/api/health
   ```
3. Confirm the real site still loads end-to-end through Caddy/TLS: `https://earcandy.example.com` (or whatever the current production domain is) responds normally.
4. Once all three are confirmed, close issue #81 referencing the merged PRs.

**Acceptance criteria:**
- [ ] External curl to `:3000` fails to connect (not `200`)
- [ ] Loopback curl to `:3000` from on the Droplet still returns `200`
- [ ] The live HTTPS site loads normally
- [ ] Issue #81 closed with a comment referencing what was verified

## Testing

No application code changes, so no unit/integration tests apply. All verification is the manual/live checks in Step 3 (static config validation) and Step 5 (live network-reachability checks against the actual production Droplet) — this is inherently an infrastructure-reachability fix that can only be meaningfully proven against the real deployed environment, not simulated in CI.

## Notes

- **Firewall-rule alternative (from the original issue) considered and rejected**, not left as an open choice: a `ufw`/cloud-firewall rule would need `ufw-docker` or manual `DOCKER-USER` iptables rules to actually take effect against Docker-published ports (confirmed this session — plain `ufw` doesn't intercept Docker's own chains). That's more moving parts, more ways to end up with a false sense of security if misconfigured, and solves nothing the loopback bind doesn't already solve more simply. Loopback-binding is also self-documenting in the exact place the exposure is created (the `docker run`/`ports:` line itself), rather than a separate, easy-to-forget firewall rule living outside version control.
- If this Droplet's setup ever changes such that Caddy runs in its own container rather than on the host (see CLAUDE.md's Docker & Deployment gotchas for the current setup), loopback-only binding would need revisiting — Caddy would then need to reach the app over the Docker bridge network instead of `localhost`, and a plain loopback bind would break that. Not a concern under the current architecture, worth a comment if that ever changes.
- Checked `scripts/setup-droplet.sh` (initial Droplet provisioning) — it does not run `docker run` or publish any ports itself (only creates directories and sets up backups), so it needs no changes here and isn't a third place this pattern could hide.
