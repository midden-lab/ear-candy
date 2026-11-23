# Runbook: Droplet host operations (patching, firewall, backups)

Everything here is done **by hand over SSH** (`ssh earcandy`, root, key-only).
CI never touches the host: the `deploy` job only replaces the app container, and
Caddy is separate (see `caddy-tls.md`). Last full pass: 2026-11-23.

## Current state (2026-11-23)

| Item | State |
|---|---|
| OS | Ubuntu 24.04 LTS, kernel `6.8.0-151-generic` (older `-138`/`-149` kernels still installed as fallbacks) |
| Docker / containerd | 29.10.0 / 2.4.2 (`live-restore` is **off**: upgrading Docker restarts the app container) |
| Caddy | 2.11.9, upgraded by hand (`caddy-tls.md`) |
| Firewall | `ufw` active, enabled at boot |
| SSH | key-only (`PasswordAuthentication no`); `PermitRootLogin yes` is still set (key-only, so low risk) |
| Auto-updates | `unattended-upgrades` is active but **never reboots**, so a pending kernel stays pending until someone reboots |
| App container | `--restart unless-stopped`, comes back by itself after a reboot |

## Patching and rebooting

**Never combine this with a promotion/deploy.** Do it as its own change.

1. **Back up first.** On the Droplet run `/opt/ear-candy/backup.sh`, then
   `scripts/prod-data-snapshot.sh > /root/snapshot-before-patching.txt`, and make
   sure the off-host pull has the result (see "Off-host backups" below, or run
   `~/ear-candy-backups/bin/pull-offhost-backup.sh` on the home-lab machine).
2. `apt-get update`, then read `apt list --upgradable`. Caddy should not be in
   the list (it has its own procedure); if it is, do not include it here.
3. `DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt-get upgrade -y -o Dpkg::Options::=--force-confold`.
   Docker/containerd packages restart the app container for a few seconds.
4. **`apt-get upgrade` holds back the kernel meta-packages** (a newer kernel is a
   *new* package). Install them explicitly:
   `apt-get install -y linux-image-virtual linux-virtual linux-headers-generic linux-headers-virtual`.
5. `systemctl reboot`. Expect about a minute of downtime.
6. **Verify after the reboot:** `uname -r` is the new kernel; `/var/run/reboot-required`
   is gone; `systemctl is-active ufw docker caddy`; `docker ps` shows `ear-candy`
   healthy; `curl -sf http://localhost:3000/api/health`;
   `scripts/prod-data-snapshot.sh --compare /root/snapshot-before-patching.txt`
   says `RESULT: OK`; the hardening check from `security-rollout.md` section 2
   (`CapDrop=[ALL]`, `NoNewPrivs: 1`); `curl -sI https://<domain>/` returns 200.
7. Old kernels can be removed later with `apt-get autoremove --purge`; `/boot`
   has plenty of room (15% used).

If the Droplet does not come back, use DigitalOcean's web console / recovery
console. The off-host backups below are the last resort.

## Firewall (`ufw`)

Rules: default **deny incoming**, **allow outgoing**; allow `22/tcp`, `80/tcp`,
`443/tcp` and `443/udp` (HTTP/3), each for IPv4 and IPv6.

- **This is defence in depth, not the main control.** The app container publishes
  `127.0.0.1:3000` only, and Caddy's admin API is on `127.0.0.1:2019`, so neither
  was reachable from outside before `ufw` was enabled.
- **Docker-published ports bypass `ufw`** (Docker writes its own iptables rules
  ahead of it). Never rely on `ufw` to hide a container port: keep publishing on
  `127.0.0.1` and put Caddy in front. If a port is ever published on `0.0.0.0`,
  `ufw` will not stop it.
- **Do NOT use `ufw limit` on SSH.** CI's `deploy` and `verify-production` jobs
  connect back to back from GitHub runners (and runner IPs vary), so rate limiting
  or source restrictions would break deploys.
- **Changing rules safely** (a bad rule can lock you out of SSH): arm a timer that
  turns the firewall off if you lose access, change the rules, test a *brand-new*
  SSH connection (`ssh -o ControlMaster=no -o ControlPath=none earcandy ...`),
  then cancel the timer:
  `systemd-run --unit=ufw-safety --on-active=5min /usr/sbin/ufw disable`
  ... make the change and test ... `systemctl stop ufw-safety.timer`.
  **If you forget to cancel it, it will switch the firewall off five minutes later.**
- Verify from outside: ports 22/80/443 open; 3000 and 2019 closed (`nc -z -G 3 <ip> 3000`).
- Tested across a reboot on 2026-11-23: `ufw` and Docker came up in the right order,
  container egress worked, no lockout.

## Backups

On the Droplet, `/opt/ear-candy/backup.sh` (cron `0 3 * * *`, **not versioned in
this repo**; an off-host copy is in `~/ear-candy-backups/`) does:

- nightly: a consistent `sqlite3 .backup` to `/opt/ear-candy/backups/db_<ts>.sqlite`
  (~140 KB), deleting `*.sqlite` files older than 14 days;
- Sundays: one `uploads_<ts>.tar.gz` (~4.5 GB), after a free-space guard. **It keeps
  exactly one tarball** and deletes the previous one before writing the new one.

The deploy job additionally copies the DB to `backups/pre-deploy_<UTC>/` (newest 5
kept). Backups on the same disk do not protect against losing the Droplet, hence:

### Off-host backups (home-lab machine)

`scripts/pull-offhost-backup.sh` runs on the maintainer's own machine (the
"home lab") and **pulls** from the Droplet, so the Droplet has no credentials to
that machine and cannot delete or tamper with the copies.

- Installed copy: `~/ear-candy-backups/bin/pull-offhost-backup.sh` (outside the
  repo so branch switches cannot break it). Scheduled by the launchd agent
  `~/Library/LaunchAgents/com.earcandy.offhost-backup.plist`, daily at 09:30; a
  run missed while the machine slept happens on wake. If you change the script in
  the repo, **copy it over the installed one** (`cp scripts/pull-offhost-backup.sh ~/ear-candy-backups/bin/`).
- Destination: `~/ear-candy-backups/rolling/` (mode 700): newest DB backup, newest
  uploads tarball, the live `Caddyfile`, `pull.log`, `last-success`. Keeps the last
  14 DB backups and 2 tarballs; dated folders beside it (e.g.
  `2026-11-23-pre-patching/`) are manual snapshots and are never touched.
- Every pull is verified: SHA-256 against the Droplet, `integrity_check` on the DB,
  `gzip -t` on the tarball, and a 20 GB free-space guard before a tarball. Any
  failure exits 1, logs `FAIL`, skips pruning and tries a desktop notification.
- Run it by hand any time: `~/ear-candy-backups/bin/pull-offhost-backup.sh`.
  Check freshness with `cat ~/ear-candy-backups/rolling/last-success`.
- Needs: the `earcandy` SSH alias, a key that works without an agent (the current
  key has no passphrase), and the machine awake and logged in.
- **Gap:** the uploads copy is only as fresh as the Droplet's Sunday tarball. An
  episode uploaded mid-week is not off-host until the next Sunday. Closing that
  needs an incremental `rsync` of `data/uploads`.
- Stop it: `launchctl bootout gui/$(id -u)/com.earcandy.offhost-backup`.

### Restoring

See `security-rollout.md` section 3 ("Restore the database from a pre-deploy
backup"). To restore from an off-host copy, `scp` the `db_*.sqlite` to the Droplet
and follow the same steps (stop the container, delete the `-wal`/`-shm` siblings,
copy it in as `db.sqlite`, `chown -R 1000:1000 /opt/ear-candy/data`, start). For
uploads: stop the container, extract the tarball with
`tar xzf uploads_<ts>.tar.gz -C /opt/ear-candy/data`, `chown -R 1000:1000`, start.

## Disk usage (2026-11-23: 55% of 24 GB)

~4.6 GB live uploads + ~4.5 GB uploads tarball + ~2.2 GB OS + ~0.6 GB Docker images.
The tarball temporarily needs about its own size in free space on Sundays (guarded by
`backup.sh`). Stable, not growing, except as episodes are added.

**Pre-downsample originals.** Episodes 96-100 were downsampled in place on 2026-08-06
(about 85 MB originals became about 56 MB). The originals had been left in
`/opt/ear-candy/backups/audio-192k/` on the Droplet, and were the only copy anywhere (the
tarballs and off-host copies hold the downsampled files). On 2026-11-23 they were copied to
`~/ear-candy-backups/audio-originals-192k/` on the home-lab machine (SHA-256 verified,
`SHA256SUMS.droplet` beside them) and then deleted from the Droplet, freeing ~414 MB.
That folder is outside `rolling/`, so the pull script never prunes it. Keep it unless you
are sure the 192k versions are not wanted.
