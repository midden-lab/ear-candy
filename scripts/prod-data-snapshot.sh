#!/usr/bin/env bash
# Read-only data snapshot / compare tool. Run ON the Droplet.
#
#   prod-data-snapshot.sh                         write + print a snapshot
#   prod-data-snapshot.sh --compare <file>        take a new snapshot, diff vs <file>
#   prod-data-snapshot.sh --compare <file> --allow-events-shrink
#
# Strictly read-only: SQLite is only ever opened with -readonly, and files are
# only counted. Exit codes: 0 ok, 1 forbidden difference, 2 usage/tooling error.
#
# DATA_DIR overrides the data directory (default /opt/ear-candy/data) so the
# script can be exercised against a scratch copy.
set -euo pipefail

DATA_DIR="${DATA_DIR:-/opt/ear-candy/data}"
DB="$DATA_DIR/db.sqlite"

if ! command -v sqlite3 > /dev/null 2>&1; then
  echo "ERROR: sqlite3 is not installed (apt-get install sqlite3). Nightly backup.sh needs it too." >&2
  exit 2
fi
if [ ! -f "$DB" ]; then
  echo "ERROR: database not found at $DB" >&2
  exit 2
fi

q() {
  sqlite3 -readonly -batch -noheader "$DB" "$1"
}

count_files() {
  # regular files directly in $1 (no recursion)
  if [ -d "$1" ]; then
    find "$1" -maxdepth 1 -type f | wc -l | tr -d ' '
  else
    echo 0
  fi
}

take_snapshot() {
  echo "ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "seasons=$(q 'SELECT COUNT(*) FROM seasons')"
  echo "episodes=$(q 'SELECT COUNT(*) FROM episodes')"
  echo "episodes_hidden=$(q 'SELECT COUNT(*) FROM episodes WHERE hidden = 1')"
  echo "settings_rows=$(q 'SELECT COUNT(*) FROM settings')"
  echo "session_epoch=$(q 'SELECT COALESCE(MAX(session_epoch), 0) FROM settings')"
  echo "schema_max=$(q 'SELECT COALESCE(MAX(version), 0) FROM schema_migrations')"
  echo "events=$(q 'SELECT COUNT(*) FROM events')"
  echo "uploads_audio_files=$(count_files "$DATA_DIR/uploads")"
  echo "uploads_image_files=$(count_files "$DATA_DIR/uploads/images")"
  echo "accent_color=$(q 'SELECT accent_color FROM settings LIMIT 1')"
  echo "max_episode_title_len=$(q 'SELECT COALESCE(MAX(LENGTH(title)), 0) FROM episodes')"
  echo "max_episode_text_len=$(q 'SELECT COALESCE(MAX(MAX(LENGTH(description), LENGTH(guests), LENGTH(tags))), 0) FROM episodes')"
  echo "max_season_title_len=$(q 'SELECT COALESCE(MAX(LENGTH(title)), 0) FROM seasons')"
  echo "max_season_number=$(q 'SELECT COALESCE(MAX(number), 0) FROM seasons')"
  echo "max_episode_number=$(q 'SELECT COALESCE(MAX(number), 0) FROM episodes')"
}

get() { # get <file> <key>
  grep -m1 "^$2=" "$1" | cut -d= -f2-
}

MODE=snapshot
COMPARE_FILE=""
ALLOW_SHRINK=0
while [ $# -gt 0 ]; do
  case "$1" in
    --compare)
      MODE=compare
      COMPARE_FILE="${2:-}"
      [ -n "$COMPARE_FILE" ] || { echo "ERROR: --compare needs a file" >&2; exit 2; }
      shift 2
      ;;
    --allow-events-shrink) ALLOW_SHRINK=1; shift ;;
    *) echo "Usage: $0 [--compare <file> [--allow-events-shrink]]" >&2; exit 2 ;;
  esac
done

if [ "$MODE" = snapshot ]; then
  take_snapshot
  exit 0
fi

[ -f "$COMPARE_FILE" ] || { echo "ERROR: baseline file not found: $COMPARE_FILE" >&2; exit 2; }

NEW="$(mktemp)"
trap 'rm -f "$NEW"' EXIT
take_snapshot > "$NEW"

FAIL=0
report() { # report <OK|DIFF|WARN|INFO> <key> <detail>
  printf '%-5s %-24s %s\n' "$1" "$2" "$3"
  [ "$1" = DIFF ] && FAIL=1
  return 0
}

for key in seasons episodes episodes_hidden schema_max uploads_audio_files uploads_image_files accent_color; do
  old="$(get "$COMPARE_FILE" "$key")"; new="$(get "$NEW" "$key")"
  if [ "$old" = "$new" ]; then report OK "$key" "$new"; else report DIFF "$key" "was $old, now $new (must be equal)"; fi
done

new="$(get "$NEW" settings_rows)"
if [ "$new" = "1" ]; then report OK settings_rows "$new"; else report DIFF settings_rows "is $new (must be exactly 1)"; fi

old="$(get "$COMPARE_FILE" session_epoch)"; new="$(get "$NEW" session_epoch)"
if [ "$new" -ge "$old" ]; then report OK session_epoch "$old -> $new"; else report DIFF session_epoch "went backwards: $old -> $new"; fi

old="$(get "$COMPARE_FILE" events)"; new="$(get "$NEW" events)"
if [ "$new" -ge "$old" ]; then
  report OK events "$old -> $new"
elif [ "$ALLOW_SHRINK" = 1 ]; then
  report WARN events "shrank $old -> $new (allowed by --allow-events-shrink)"
else
  report DIFF events "shrank $old -> $new (pass --allow-events-shrink if retention was enabled on purpose)"
fi

for key in max_episode_title_len max_episode_text_len max_season_title_len max_season_number max_episode_number; do
  report INFO "$key" "$(get "$COMPARE_FILE" "$key") -> $(get "$NEW" "$key")"
done

if [ "$FAIL" = 0 ]; then echo "RESULT: OK"; else echo "RESULT: DIFF"; fi
exit "$FAIL"
