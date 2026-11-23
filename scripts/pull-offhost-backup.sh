#!/bin/bash
# Pull the newest Droplet backups to THIS machine (the "home lab").
# Pull-based on purpose: the Droplet holds no credentials to this machine, so
# a compromised Droplet cannot reach or delete these copies.
#
# Safe to run as often as you like: files already present with a matching
# SHA-256 are skipped. Intended to run daily from launchd; the weekly uploads
# tarball is then picked up the first time the machine is awake after the
# Droplet's Sunday 03:00 backup.
#
#   pull-offhost-backup.sh
#
# Env overrides: REMOTE (ssh host alias, default earcandy),
#   DEST (default ~/ear-candy-backups/rolling), KEEP_DB (14), KEEP_UPLOADS (2),
#   MIN_FREE_GB (20, required free space before pulling a tarball).
#
# Exit codes: 0 ok, 1 a check failed (checksum, gzip, integrity, low disk).
# Dated manual snapshot folders next to $DEST are never touched.
set -uo pipefail

REMOTE="${REMOTE:-earcandy}"
REMOTE_DIR="${REMOTE_DIR:-/opt/ear-candy/backups}"
DEST="${DEST:-$HOME/ear-candy-backups/rolling}"
KEEP_DB="${KEEP_DB:-14}"
KEEP_UPLOADS="${KEEP_UPLOADS:-2}"
MIN_FREE_GB="${MIN_FREE_GB:-20}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15)

umask 077
mkdir -p "$DEST"
chmod 700 "$DEST"
LOG="$DEST/pull.log"
FAIL=0

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG"; }
fail() { log "FAIL: $*"; FAIL=1; }

notify_failure() {
  # Best-effort desktop notification; silent when no GUI session.
  osascript -e 'display notification "Ear Candy off-host backup pull failed — see pull.log" with title "Ear Candy backup"' >/dev/null 2>&1 || true
}

sha_local() { shasum -a 256 "$1" | awk '{print $1}'; }

# Fetch one remote file into $DEST if absent/mismatched, verifying its hash.
fetch() { # fetch <remote-name> <remote-sha256>
  local name="$1" want="$2" tmp="$DEST/.$1.partial"
  if [ -f "$DEST/$name" ] && [ "$(sha_local "$DEST/$name")" = "$want" ]; then
    log "have $name (checksum matches), skipping"
    return 0
  fi
  log "fetching $name"
  if ! scp -q "${SSH_OPTS[@]}" "$REMOTE:$REMOTE_DIR/$name" "$tmp"; then
    rm -f "$tmp"; fail "scp of $name failed"; return 1
  fi
  if [ "$(sha_local "$tmp")" != "$want" ]; then
    rm -f "$tmp"; fail "checksum mismatch for $name"; return 1
  fi
  mv "$tmp" "$DEST/$name"
  log "fetched $name, checksum OK"
}

# --- discover the newest remote files and their hashes (one SSH call) ------
LISTING="$(ssh "${SSH_OPTS[@]}" "$REMOTE" "cd $REMOTE_DIR && \
  DB=\$(ls -t db_*.sqlite 2>/dev/null | head -1); \
  UP=\$(ls -t uploads_*.tar.gz 2>/dev/null | head -1); \
  [ -n \"\$DB\" ] && sha256sum \"\$DB\"; \
  [ -n \"\$UP\" ] && sha256sum \"\$UP\"; \
  [ -n \"\$UP\" ] && stat -c 'SIZE %s' \"\$UP\"; true" 2>&1)" || {
  fail "could not list remote backups: $LISTING"; notify_failure; exit 1; }

DB_SHA="$(printf '%s\n' "$LISTING" | awk '$2 ~ /^db_.*\.sqlite$/ {print $1}')"
DB_NAME="$(printf '%s\n' "$LISTING" | awk '$2 ~ /^db_.*\.sqlite$/ {print $2}')"
UP_SHA="$(printf '%s\n' "$LISTING" | awk '$2 ~ /^uploads_.*\.tar\.gz$/ {print $1}')"
UP_NAME="$(printf '%s\n' "$LISTING" | awk '$2 ~ /^uploads_.*\.tar\.gz$/ {print $2}')"
UP_SIZE="$(printf '%s\n' "$LISTING" | awk '$1 == "SIZE" {print $2}')"

# --- database backup ---------------------------------------------------------
if [ -n "$DB_NAME" ]; then
  fetch "$DB_NAME" "$DB_SHA" && {
    # copy to a scratch file so opening it can never create -wal/-shm beside the original
    chk="$(mktemp)"; cp "$DEST/$DB_NAME" "$chk"
    res="$(sqlite3 -batch "$chk" 'PRAGMA integrity_check;' 2>&1)"; rm -f "$chk"
    [ "$res" = "ok" ] && log "integrity_check OK for $DB_NAME" || fail "integrity_check on $DB_NAME: $res"
  }
else
  fail "no db_*.sqlite found on $REMOTE"
fi

# --- uploads tarball (large; guard free space first) -------------------------
if [ -n "$UP_NAME" ]; then
  if [ -f "$DEST/$UP_NAME" ] && [ "$(sha_local "$DEST/$UP_NAME")" = "$UP_SHA" ]; then
    log "have $UP_NAME (checksum matches), skipping"
  else
    free_kb="$(df -k "$DEST" | awk 'NR==2{print $4}')"
    need_kb=$(( (UP_SIZE / 1024) + MIN_FREE_GB * 1024 * 1024 ))
    if [ "$free_kb" -lt "$need_kb" ]; then
      fail "not enough free space to pull $UP_NAME (free ${free_kb}KB, need ${need_kb}KB)"
    else
      fetch "$UP_NAME" "$UP_SHA"
    fi
  fi
  if [ -f "$DEST/$UP_NAME" ]; then
    gzip -t "$DEST/$UP_NAME" 2>/dev/null && log "gzip -t OK for $UP_NAME" || fail "gzip -t failed for $UP_NAME"
  fi
else
  log "no uploads_*.tar.gz on $REMOTE yet"
fi

# --- small config files (overwritten each run) ------------------------------
scp -q "${SSH_OPTS[@]}" "$REMOTE:/etc/caddy/Caddyfile" "$DEST/Caddyfile" 2>/dev/null \
  && log "refreshed Caddyfile" || log "WARN: could not fetch Caddyfile"

# --- retention (only files matching our own patterns, inside $DEST) ---------
prune() { # prune <glob-prefix> <suffix> <keep>
  # shellcheck disable=SC2012
  ls -t "$DEST"/$1*$2 2>/dev/null | tail -n +"$(( $3 + 1 ))" | while read -r f; do
    log "pruning old $(basename "$f")"; rm -f -- "$f"
  done
}
# Only prune when this run succeeded, so a failing run never shrinks history.
if [ "$FAIL" = 0 ]; then
  prune db_ .sqlite "$KEEP_DB"
  prune uploads_ .tar.gz "$KEEP_UPLOADS"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$DEST/last-success"
  log "done: OK"
  exit 0
fi

notify_failure
log "done: FAILED"
exit 1
