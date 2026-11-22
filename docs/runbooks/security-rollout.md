# Runbook: security-remediation rollout checklist

Companion to `plans/020-security-audit-remediation.md`. Each phase of that plan
ships as its own `dev` → `main` promotion PR (squash-merged by the maintainer,
by hand). Merging to `main` deploys to production, so run this checklist around
**every** promotion merge. Nothing here is run by an agent.

All commands run on the Droplet (`ssh root@<droplet>`) unless noted.

## 1. Before merging the promotion PR

1. Confirm `sqlite3` is installed: `command -v sqlite3`. If it isn't,
   `apt-get install -y sqlite3` — the nightly `/opt/ear-candy/backup.sh` calls
   it and fails silently under cron without it (plan finding L6).
2. Take a fresh backup: `/opt/ear-candy/backup.sh`.
3. Confirm `/opt/ear-candy/backups/` now holds a new `db_<timestamp>.sqlite`
   and `uploads_<timestamp>.tar.gz`.
4. Save a data snapshot and keep the output:
   `scripts/prod-data-snapshot.sh | tee ~/snapshot-before.txt`
   (copy the script to the Droplet first if it isn't there; it is read-only).
5. Confirm every check on the promotion PR is green (`gh pr checks <n>`),
   including the production-image `e2e` job.
6. Before Phase C only: pull a backup off-host (issues #1/#37) at least once.

## 2. After the deploy

1. The `deploy` and `verify-production` jobs are green. If `deploy` is red
   with a `ROLLED BACK to ...` line, the previous image is serving again —
   investigate before re-promoting (see section 3).
2. Compare data: `scripts/prod-data-snapshot.sh --compare ~/snapshot-before.txt`
   (exit 0 / `RESULT: OK` expected). `seasons`, `episodes`, `episodes_hidden`,
   `schema_max`, `uploads_*` and `accent_color` must be equal, `settings_rows`
   exactly 1, `session_epoch` and `events` not lower. Pass
   `--allow-events-shrink` only if event retention was enabled on purpose.
3. Check audio serving (not covered by the deploy health check, so a
   regression here would not trigger the auto-rollback): take an upload-type
   episode's `audio_path` from `https://<domain>/api/episodes` and run
   `curl -s -o /dev/null -w '%{http_code} %{size_download}\n' -H 'Range: bytes=0-1023' https://<domain><audio_path>`.
   Expect `206 1024`.
4. Confirm the container hardening is actually in effect (a flag in the
   repo is not proof of what the running container got — see CLAUDE.md gotcha
   37b). On the Droplet:
   `docker inspect ear-candy --format 'CapDrop={{.HostConfig.CapDrop}} SecurityOpt={{.HostConfig.SecurityOpt}}'`
   expects `CapDrop=[ALL] SecurityOpt=[no-new-privileges:true]`, and
   `docker exec ear-candy sh -c 'id -u; grep -E "^(CapEff|NoNewPrivs):" /proc/1/status'`
   expects `1000`, `CapEff: 0000000000000000` and `NoNewPrivs: 1`. If the
   deploy log says `ROLLED BACK ... WITHOUT hardening flags`, the flags were
   the problem: that container is running unhardened on purpose, to stay up.
5. Only once the repository variable `PUBLIC_ORIGIN` has been set (it is
   deliberately unset by default, so Open Graph tags follow the request's
   `Host` header): on the Droplet, with a real episode id,
   `curl -s -A facebookexternalhit -H 'Host: attacker.example' 'http://localhost:3000/?episode=<id>' | grep -o 'og:url" content="[^"]*"'`
   must show your pinned origin, not `attacker.example`. A value with a path
   or other typo is silently ignored and would still show the attacker host.
6. Smoke test in a browser: load the public site, play one episode, log into
   admin, open Settings and Analytics.

## 3. Rollback

### Automatic (deploy job)

The `deploy` job records the running image before replacing it. If the new
container fails its health check, the job removes it, starts the previous
image with identical flags, waits for health, prints `ROLLED BACK to <image>`,
and **still exits non-zero** so the pipeline stays red. The previous image is
not pruned until the new one is healthy.

If the rollback with the hardening flags is also unhealthy, the job retries
once more **without** `--cap-drop`/`--security-opt` (a rollback that reused
flags which turned out to be the cause would otherwise leave nothing running).
That run still exits non-zero so the pipeline stays red, and its message says
`ROLLED BACK ... WITHOUT hardening flags`.

### Restore the database from a pre-deploy backup

On every deploy, after the old container is stopped (so SQLite files are
cleanly closed) and before the new one starts, the job copies the DB files to
`/opt/ear-candy/backups/pre-deploy_<UTC-timestamp>/`. The files are named
`db.sqlite.predeploy`, `db.sqlite-wal.predeploy` and `db.sqlite-shm.predeploy`
(each only if it existed). The `.predeploy` suffix is deliberate: `backup.sh`
deletes `*.sqlite` files older than 14 days recursively, and these names don't
match that rule. Only the newest 5 `pre-deploy_*` directories are kept.

1. `docker stop ear-candy`
2. `rm -f /opt/ear-candy/data/db.sqlite /opt/ear-candy/data/db.sqlite-wal /opt/ear-candy/data/db.sqlite-shm`
3. `D=/opt/ear-candy/backups/pre-deploy_<timestamp>`, then for each file that
   exists: `cp -a $D/db.sqlite.predeploy /opt/ear-candy/data/db.sqlite`
   (and likewise `-wal` / `-shm`, dropping the `.predeploy` suffix).
4. `chown -R 1000:1000 /opt/ear-candy/data`
5. Start the container again (re-run the last good deploy, or the manual steps
   below). The `-wal`/`-shm` files must be restored together with `db.sqlite`
   or deleted together — never mix generations (CLAUDE.md gotcha 5).

A `db.sqlite.pre-migration-*.bak` (written by `migrate.ts`) or a nightly
`db_*.sqlite` from `backup.sh` can be restored the same way; delete any
`-wal`/`-shm` siblings first.

### Hand-roll back to the previous image (if auto-rollback itself fails)

1. Find the previous image: `docker images --digests | grep ear-candy`, or the
   `Pulling image by digest:` line in the previous successful deploy's log.
2. `docker rm -f ear-candy`
3. Re-run the `docker run` from the `deploy` job in
   `.github/workflows/ci-cd.yml` with that image reference and the same flags
   and `-e` values (`COOKIE_SECRET` and `ADMIN_PASSWORD_HASH` come from the
   GitHub secrets; **single-quote** the bcrypt hash — it contains `$`).
4. `curl -sf http://localhost:3000/api/health`.
5. Revert the offending commit on `main` through a normal promotion so the
   next deploy doesn't reintroduce it.
