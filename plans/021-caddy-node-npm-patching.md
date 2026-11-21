---
id: caddy-node-npm-patching
title: "Patch Caddy, the Node base image and server npm advisories (supersedes plan 020 Step 3)"
status: in-progress
priority: 1
created: 2026-11-21
steps_completed: 3
steps_total: 7
tags: [security, patching, caddy, node, dependencies, deploy-safety]
---

# Patch Caddy, the Node base image and server npm advisories

## Summary

A CVE review on 2026-11-21 found three internet-facing components behind on security releases: **Caddy** on the Droplet (2.11.4; 2.11.5 fixes CVE-2026-55458 in the reverse proxy's handling of upstream `101` responses; 2.11.9 is what apt offers), the **Node 22 base image** (22.23.2; 22.23.5 is a security release with a High HTTP/2 fix, and the October release fixed a High Brotli write), and the **server npm dependencies** (Dependabot: 19 High across both packages, of which the server's runtime-reachable ones are `@fastify/busboy`, `sharp`, `music-metadata`, `fastify`, `fast-uri`). This plan patches all three with the safety nets from plan 020 Phase A (pre-deploy DB copy, automatic rollback, snapshot/compare tool) already live. **It supersedes plan 020 Step 3**, which is left unchecked with a pointer here.

## Context

- **Verification limits:** the CVE/fix-version information came from web-search snippets, not full advisories. The executor must treat fix versions as leads and confirm each against the upstream advisory/changelog before relying on it (Step 1 and Step 3 say where).
- **Scope decisions (made with the maintainer):** server npm only. Client alerts (`undici`, `vite`, `source-map-js`) are build/test tooling that doesn't ship; apply only non-major fixes if `npm audit fix` in `client/` offers them for free, otherwise leave them to plan 018. Do **not** use `--force` anywhere. The Caddy upgrade targets **2.11.9** and is run by the agent over SSH only after the review gate in Step 1 is approved. The Node pin gets bumped once and Dependabot's `docker` ecosystem is added.
- **Droplet access:** `ssh earcandy` (root; host alias in `~/.ssh/config`). The agent may run only the commands written in Step 1 and Step 7, and never `apt upgrade`/`apt full-upgrade` (a blanket upgrade would also pull containerd/Docker/kernel updates, which are a separate, riskier change that needs a reboot).
- **Caddy facts verified on 2026-11-21:** installed 2.11.4 from the Cloudsmith apt repo; `apt-cache policy caddy` lists **only 2.11.9** in the version table, so `apt-get install caddy=2.11.4` will **not** work as a rollback — the old binary must be saved before upgrading. Live `/etc/caddy/Caddyfile` is the 3-line `<domain> { reverse_proxy localhost:3000 }` config matching `infra/Caddyfile.template`. Service is `caddy` (systemd). `ufw` is inactive and a reboot is pending on the host (out of scope).
- **Disk:** the Droplet had ~8.5 GB free on `/` after plan 020's backup rewrite. Step 1 requires ≥ 3 GB free before touching anything.
- **Toolchain:** the host Node may still be broken (`dyld ... libsimdutf` error, see plan 020 Context). Check `node -v` first. If broken, run npm/vitest in the pinned-container fallback from plan 020's Context (copy `server/` without `node_modules`/`data` into a temp dir; never bind-mount the real `server/` with `npm ci`). Use `make` targets for lint/test/e2e; run `make e2e-reset-db` before every e2e run, and note `make e2e` needs the dev stack (`make up`).
- **Branching (CLAUDE.md):** work on a branch off `dev`, PR → `dev`, then a `dev`→`main` promotion PR that the maintainer squash-merges by hand. The agent never pushes to `main` and never merges the promotion PR. After the squash merge, resync `dev` per CLAUDE.md.
- **Deploy safety already in place (plan 020 Phase A):** `deploy` takes a pre-deploy DB copy, auto-rolls back on a failed health check, and `scripts/prod-data-snapshot.sh` (on the Droplet at `/root/prod-data-snapshot.sh`) compares before/after data. No schema changes occur in this plan, so the data-bearing counts must be identical before and after.
- **Files involved:** `server/package.json`, `server/package-lock.json`, `Dockerfile`, `.github/dependabot.yml`, `docs/runbooks/caddy-tls.md`, `CLAUDE.md`, `plans/020-security-audit-remediation.md` (Notes), and on the Droplet `/etc/caddy/`, `/usr/bin/caddy`.

## Preconditions

- `git status` clean; start from an up-to-date `dev` (`git checkout dev && git pull`).
- Create the branch `security/patching-021` off `dev` when reaching Step 2 (Step 1 touches no repo files).

## Steps

### Step 1: Upgrade Caddy on the Droplet from 2.11.4 to 2.11.9

**Files:** none in the repo (Droplet only: `/usr/bin/caddy`, `/etc/caddy/Caddyfile`)
**Requires review:** true (production, internet-facing; brief TLS/proxy interruption)

Before running anything, read Caddy's release notes/changelog for 2.11.5 through 2.11.9 (GitHub releases for `caddyserver/caddy`) and confirm CVE-2026-55458 is fixed in 2.11.5 and that nothing in 2.11.5–2.11.9 changes `reverse_proxy` or automatic-HTTPS defaults in a way that affects a plain `<domain> { reverse_proxy localhost:3000 }` config. Show the maintainer a two-line summary at the review gate; stop and ask if any release note mentions a breaking change.

Then, over `ssh earcandy`, run in this order, stopping at the first failure:

1. Preflight: `df -h / | tail -1` shows ≥ 3 GB free; `caddy version` prints `v2.11.4`; `systemctl is-active caddy` prints `active`; `curl -sf http://localhost:3000/api/health` returns `{"ok":true,...}`; read the domain from `/etc/caddy/Caddyfile` and record `curl -sI https://<domain>/api/health` status (expect 200).
2. Save rollback material: `cp -a /usr/bin/caddy /root/caddy-2.11.4.bin` and `cp -a /etc/caddy/Caddyfile /root/Caddyfile.pre-2.11.9`. Confirm both exist and `/root/caddy-2.11.4.bin version` prints v2.11.4. (Apt cannot downgrade here; this is the rollback.)
3. Upgrade only Caddy: `DEBIAN_FRONTEND=noninteractive apt-get install -y --only-upgrade caddy`. **Never** `apt-get upgrade`/`dist-upgrade`. If apt asks about a modified conffile, keep the existing `/etc/caddy/Caddyfile`.
4. `diff /etc/caddy/Caddyfile /root/Caddyfile.pre-2.11.9` is empty; `caddy validate --config /etc/caddy/Caddyfile` passes; `caddy version` prints v2.11.9.
5. Ensure the running process uses the new binary: `systemctl restart caddy` if the package didn't already restart it (compare `systemctl show caddy -p ActiveEnterTimestamp` to the time of the upgrade), then `systemctl is-active caddy` = `active`.
6. Verify: `curl -sI https://<domain>/api/health` returns 200 over valid TLS (no `-k`), `curl -s https://<domain>/api/health` returns `{"ok":true,...}`, the `ear-candy` container is untouched (`docker ps` shows the same container ID/uptime as before), and `journalctl -u caddy --since "10 min ago" --no-pager | grep -iE "error|warn" ` shows nothing alarming (a one-time certificate-maintenance line is fine).

**Rollback (execute immediately if any of 4–6 fail):** `systemctl stop caddy && cp -a /root/caddy-2.11.4.bin /usr/bin/caddy && cp -a /root/Caddyfile.pre-2.11.9 /etc/caddy/Caddyfile && systemctl start caddy`, then repeat the step 6 checks and report. Tell the maintainer apt will keep offering 2.11.9, so consider `apt-mark hold caddy` only if they want to stay on 2.11.4.

**Acceptance criteria:**
- [x] `caddy version` on the Droplet reports v2.11.9 and `systemctl is-active caddy` is `active`.
- [x] `/etc/caddy/Caddyfile` is byte-identical to the pre-upgrade copy and `caddy validate` passes.
- [x] `https://<domain>/api/health` returns 200 with a valid certificate and body containing `"ok":true`.
- [x] The `ear-candy` container ID and start time are unchanged (Caddy upgrade did not touch Docker).
- [x] `/root/caddy-2.11.4.bin` and `/root/Caddyfile.pre-2.11.9` exist (kept for rollback).
- [x] No other package was upgraded (`grep "$(date +%F)" /var/log/apt/history.log` lists only caddy).

---

### Step 2: Patch server npm advisories without major bumps

**Files:** `server/package.json`, `server/package-lock.json`
**Requires review:** true (native modules `sharp`/`music-metadata`; the upload pipeline)

Create the branch `security/patching-021` off `dev`. Confirm the toolchain (see Context). In `server/` only (never the repo root, never with Docker bind-mounted over the real `server/`):

1. Record the baseline: `npm audit --omit=dev` and `npm audit` (full) into the scratchpad.
2. Run `npm audit fix` (no `--force`). If a fix needs a **major** bump, do not apply it: leave that package, and record it with its reason in this plan's Notes.
3. Explicitly check that these end at or above their patched versions, bumping the declared range in `package.json` only if the lockfile can't otherwise reach it: `sharp ≥ 0.35.5`, `fastify ≥ 5.12.6`, `@fastify/busboy ≥ 3.2.2`, `fast-uri ≥ 4.2.3` (or 3.1.9 on the 3.x line), `music-metadata` at the latest patch of its current major, `brace-expansion`, `minimatch`, `glob`. Confirm each target against the advisory page before relying on the version in this plan.
4. In `client/`, run `npm audit fix --dry-run` only; apply it **only** if it changes nothing but patch/minor versions of already-declared deps. Do not touch client majors (plan 018 owns them).

Gate (all required): `make lint`, `make test`, `server/tests/audio-range.test.ts` run explicitly (CLAUDE.md gotcha 17a), `make e2e-reset-db` then `make e2e` (real audio decode, image and favicon upload), and `docker build .` of the root Dockerfile (native `bcrypt`/`better-sqlite3`/`sharp` rebuild on Alpine).

**Acceptance criteria:**
- [x] `cd server && npm audit --omit=dev` reports 0 high/critical; any remaining moderate is listed in Notes with its reason.
- [x] `git diff --stat` shows only `server/package.json` and `server/package-lock.json` (plus `client/` lock files only if the dry-run rule above applied).
- [x] `make lint`, `make test`, `make e2e` and `docker build .` all succeed; duration auto-detection and upload e2e tests pass unchanged.
- [x] `server/tests/audio-range.test.ts` passes.
- [x] No test was weakened or skipped to get green; if one only passes after being changed, stop and ask.

---

### Step 3: Bump the Node base image pin from 22.23.2 to 22.23.5

**Files:** `Dockerfile`
**Requires review:** true (changes the runtime of the whole production image)

Resolve the digest from the registry, never by hand: `docker buildx imagetools inspect node:22.23.5-alpine --format '{{json .Manifest.Digest}}'` (or `docker pull node:22.23.5-alpine` then `docker inspect --format '{{index .RepoDigests 0}}'`). Confirm the tag exists and that it is the multi-arch index digest, the same kind of reference as the current pin. Replace the digest in **all four** `FROM node:22-alpine@sha256:...` lines (stages `client-builder`, `server-builder`, `deps`, `runner`) so they stay identical, and keep a comment noting the Node version the digest corresponds to. Also `grep -rn "c610fcdf" .` to find any other place the old digest is referenced (workflows, docs, `server/Dockerfile.dev`) and update or report it; CLAUDE.md's "pinned to a full digest" convention must still hold.

Then build and smoke-test the production image locally: `docker build -t ear-candy:node-bump .`; `docker run --rm ear-candy:node-bump node -v` prints `v22.23.5`; start it the way CI's `e2e` job does (same env vars, no volume) and confirm `/api/health` and `/api/settings` return 200 and that the `node` user (uid 1000) can write `/app/data` (health `uploads:true`/`db:true`). Check `docker run --rm ear-candy:node-bump sh -c "apk info -v | grep -E '^(openssl|libssl3|musl|zlib)'"` and record the versions in Notes.

**Acceptance criteria:**
- [x] All four `FROM` lines carry the same new digest and `node -v` inside the built image is `v22.23.5`.
- [x] The digest was resolved from the registry (command recorded in the commit message), not typed.
- [x] The locally started production image passes `/api/health` with `db:true` and `uploads:true`.
- [x] No remaining reference to the old digest, or each is explained in Notes.

---

### Step 4: Add Dependabot's `docker` ecosystem so digest bumps arrive as PRs

**Files:** `.github/dependabot.yml`
**Requires review:** false

Append an entry for the root `Dockerfile`, matching the existing style:

```yaml
  - package-ecosystem: docker
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
```

Do not add the `*.Dockerfile.dev` directories (dev-only, unpinned).

**Acceptance criteria:**
- [ ] The file parses as YAML (`python3 -c 'import yaml'` is unavailable here, so verify with `ruby -ryaml -e` or by reading the file; or a `gh api` dry check is not required) and contains exactly one new `docker` entry for `/`.
- [ ] The existing four entries are unchanged.

---

### Step 5: Record the upgrade procedure and the new facts in the docs

**Files:** `docs/runbooks/caddy-tls.md`, `CLAUDE.md`, `plans/020-security-audit-remediation.md`
**Requires review:** false

- `docs/runbooks/caddy-tls.md`: add an "Upgrading Caddy" section containing the Step 1 procedure as actually executed (preflight, saving `/usr/bin/caddy` + Caddyfile first because the Cloudsmith repo only offers the latest version, `--only-upgrade caddy`, validate, verify, rollback), plus the warning never to run a blanket `apt upgrade` for this.
- `CLAUDE.md`: in the Docker/Deployment gotchas, note that the base image is digest-pinned in four stages and now has Dependabot `docker` coverage, and that Caddy is upgraded by the runbook, not by CI. Do not duplicate the runbook text.
- `plans/020-security-audit-remediation.md`: in its **Notes** section add one line: "Step 3 (Phase B) is superseded by plan 021 (Caddy, Node image pin and server npm patches); mark it complete or skipped when 021 ships." Change nothing else in plan 020, including its frontmatter.

**Acceptance criteria:**
- [ ] The runbook section lists every Step 1 command and the rollback.
- [ ] CLAUDE.md mentions the digest pin/Dependabot docker coverage in one or two sentences.
- [ ] `git diff plans/020-security-audit-remediation.md` shows exactly one added line in Notes.

---

### Step 6: Run the full gates, merge to `dev`, and open the promotion PR

**Files:** none (git/GitHub only)
**Requires review:** true (outward-facing; the promotion merge deploys to production)

Commit per step on `security/patching-021` (Steps 2–5, one commit each; Step 1 has no commit). Run `make lint`, `make test`, `make e2e-reset-db` + `make e2e` once more on the final tree. Push the branch, open a PR into `dev`, merge it when `gh pr checks` is green, and confirm the latest `dev` CI run is `success` (`gh run list --branch dev --limit 1`). Then open (do **not** merge) a `dev`→`main` promotion PR whose description lists the steps, notes that the production image's `e2e` job exercises the new Node base image and rebuilt native modules, notes the Caddy upgrade was already applied on the Droplet (Step 1), and links `docs/runbooks/security-rollout.md`. Confirm `gh pr checks <n>` shows every check passing, including the production-image `e2e`.

**Acceptance criteria:**
- [ ] Working branch merged into `dev` via PR; latest `dev` run is `success`.
- [ ] A `dev`→`main` promotion PR is open, not merged, with all checks green (`gh pr list --base main --head dev --state open`).
- [ ] The agent has not pushed to `main` or merged the promotion PR.

---

### Step 7: Post-deploy verification and `dev` resync (after the maintainer merges the promotion PR)

**Files:** none (Droplet read-only checks, then git)
**Requires review:** true (production access)

Prerequisite, done by the maintainer or approved by them at this gate: take a pre-merge snapshot on the Droplet (`/root/prod-data-snapshot.sh | tee /root/snapshot-before-021.txt`) and confirm `/opt/ear-candy/backups/` has a recent `db_*.sqlite` (the nightly job now takes a DB-only backup). After the maintainer merges, wait for `deploy` and `verify-production` to finish green, then over SSH run only read-only checks: `/root/prod-data-snapshot.sh --compare /root/snapshot-before-021.txt` (expect `RESULT: OK`), `docker ps` (new container healthy), `docker exec ear-candy node -v` (expect `v22.23.5`), `curl -sf https://<domain>/api/health`, and `ls /opt/ear-candy/backups/pre-deploy_*` (a new pre-deploy copy exists). Check that `df -h /` still has ≥ 3 GB free. Finally resync `dev` per CLAUDE.md (`git checkout dev && git reset --hard origin/main && git push --force origin dev`). If `deploy` rolled back (`ROLLED BACK to ...` in its log), stop and report instead of retrying.

**Acceptance criteria:**
- [ ] `deploy` and `verify-production` are green and the snapshot compare prints `RESULT: OK`.
- [ ] The running container reports Node `v22.23.5` and `/api/health` is `ok` over HTTPS through Caddy 2.11.9.
- [ ] `dev` equals `origin/main` after the resync.
- [ ] Plan 020's Step 3 status is left for the maintainer to mark; this plan's `steps_completed` is updated to 7.

## Testing

- **No new application tests** are added: this plan changes dependency versions, a base image and a proxy binary, not behavior. The regression net is the existing suite: `make test` (including `server/tests/audio-range.test.ts`), `make e2e` (real audio decode, image/favicon/audio upload), CI's production-image `e2e` job (exercises the new Node image and Alpine-rebuilt native modules), and the post-deploy snapshot compare.
- **Caddy:** verified live (validate, HTTPS health check, container untouched), not testable in CI.
- If an existing test fails after Step 2, the dependency bump is the suspect; do not edit the test to pass.

## Notes

- **Why not `apt upgrade`:** the Droplet also has pending containerd 2.4.2, Docker 29.10.0 and a newer kernel with a reboot pending. Those need a quiet window and a reboot (the container restarts) and are deliberately left to a separate plan, along with enabling `ufw`.
- **Why the old Caddy binary is saved:** the Cloudsmith repo only lists the latest version, so a downgrade through apt isn't possible.
- **Alternative considered:** pinning Caddy to 2.11.5 (smallest jump that fixes CVE-2026-55458). Rejected by the maintainer in favour of 2.11.9; revisit only if a release note shows a breaking change.
- **Client alerts** (`undici`, `vite`, `source-map-js`, `@vitest/mocker`, `postcss-selector-parser`) are left to plan 018 unless `npm audit fix` fixes them for free.
- Step 2 (done 2026-11-21): `npm audit` in `server/` went from 9 prod / 21 total to 0 / 0; no advisory left unfixed. Only `server/package-lock.json` changed. The lockfile contains 9 transitive major bumps that `npm audit fix` applied without `--force` because they are within parents' declared ranges: `content-disposition` 2→3, `glob` 13→14, `minimatch` 10→11, `path-scurry` 2→3 (all four prod-path, via `@fastify/static` 10.1.3→10.1.12) and dev-only `file-entry-cache`, `flat-cache`, `keyv`, `obug`, `why-is-node-running`. Maintainer approved keeping them; all gates passed (lint, 272 server + 449 client tests, `audio-range.test.ts`, e2e 50 passed/2 skipped, `docker build .`, native modules load in the Alpine image). Client: `npm audit fix --dry-run` includes 3 major bumps (`minimatch`, `obug`, `why-is-node-running`), so it was not applied; left to plan 018 (15 client advisories remain, dev tooling).
- Step 3 (done 2026-11-21): new pin `sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a` (index digest of `node:22.23.5-alpine`, resolved with `docker buildx imagetools inspect`). Image reports Node v22.23.5, Alpine 3.24.4, openssl/libssl3/libcrypto3 3.5.9-r0 (was 3.5.7), musl 1.2.6-r3, zlib 1.3.2-r1. The same digest was also applied to `.github/workflows/ci-cd.yml` (the e2e job's CI-credential hashing `docker run`), with the maintainer's approval; the old digest remains only in plan 020's historical fallback command.
- The CVE ids and fix versions in the Summary came from search-result snippets on 2026-11-21 and were not individually verified against upstream advisories.
