#!/usr/bin/env bash
# Downloads DB-IP's free "IP to Country Lite" database (.mmdb format) for
# Ear Candy's optional GeoIP country breakdown (see server/src/utils/geoip.ts
# and the GEOIP_DB_PATH env var documented in README.md). Analytics work
# fully without this — country breakdowns just stay empty until it's run.
#
# Unlike MaxMind's GeoLite2 (which now requires a free account + license
# key), DB-IP's free Lite database is a direct, unauthenticated download —
# no signup needed, so this script needs zero local setup beyond curl.
# It's licensed CC BY 4.0: if you use the resulting country data, credit
# DB-IP.com somewhere visible (e.g. your admin analytics page footer).
#
# DB-IP publishes a new file each month, named with that month's date, so
# this needs periodic re-running (roughly monthly) to stay current — it is
# NOT a one-time setup step. The exact file for the current month may not
# be published yet in the first few days of a new month, so this script
# tries the current month first and falls back to the previous month.
#
# Works both for local dev (default destination) and for a production
# deployment (pass the destination on the Droplet's persistent data dir),
# following the same "copy this script over and run it against the real
# data directory" pattern as the one-off scripts in server/scripts/ — see
# CLAUDE.md's Docker & Deployment gotchas for that pattern in general.
#
# Usage:
#   scripts/fetch-geoip-db.sh [destination-path]
#
#   destination-path   Where to write the .mmdb file.
#                       Default: server/data/geoip/dbip-country-lite.mmdb
#
# Examples:
#   scripts/fetch-geoip-db.sh
#   scripts/fetch-geoip-db.sh /opt/ear-candy/data/geoip/dbip-country-lite.mmdb

set -euo pipefail

DEST="${1:-server/data/geoip/dbip-country-lite.mmdb}"
BASE_URL="https://download.db-ip.com/free/dbip-country-lite"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required but was not found on PATH." >&2
  exit 1
fi

DEST_DIR="$(dirname "$DEST")"
mkdir -p "$DEST_DIR"

TMP_GZ="$(mktemp "${TMPDIR:-/tmp}/dbip-country-lite.XXXXXX.mmdb.gz")"
cleanup() { rm -f "$TMP_GZ"; }
trap cleanup EXIT

# Portable current/previous year-month (bash 3.2 has no associative
# arrays, but plain `date` arithmetic here needs none). BSD date (macOS)
# and GNU date (Linux) disagree on -d/-v flags, so compute "previous month"
# without relying on either — just decrement, wrapping year at January.
CUR_YEAR="$(date +%Y)"
CUR_MONTH="$(date +%m)"

PREV_YEAR="$CUR_YEAR"
PREV_MONTH=$((10#$CUR_MONTH - 1))
if [[ "$PREV_MONTH" -lt 1 ]]; then
  PREV_MONTH=12
  PREV_YEAR=$((CUR_YEAR - 1))
fi
PREV_MONTH_PADDED="$(printf '%02d' "$PREV_MONTH")"

try_download() {
  local year="$1" month="$2"
  local url="${BASE_URL}-${year}-${month}.mmdb.gz"
  echo "Trying $url ..."
  curl -fsSL "$url" -o "$TMP_GZ"
}

if try_download "$CUR_YEAR" "$CUR_MONTH"; then
  echo "Downloaded ${CUR_YEAR}-${CUR_MONTH} release."
elif try_download "$PREV_YEAR" "$PREV_MONTH_PADDED"; then
  echo "Current month's release isn't published yet — used ${PREV_YEAR}-${PREV_MONTH_PADDED} instead."
else
  echo "Could not download either the current or previous month's release from $BASE_URL." >&2
  echo "Check https://db-ip.com/db/lite.php in case DB-IP changed their download URL scheme." >&2
  exit 1
fi

gunzip -c "$TMP_GZ" > "$DEST"
echo
echo "Wrote $DEST"
echo "Remember: this file needs periodic re-downloading (about monthly) to stay current — re-run this script to refresh it."
echo "Attribution required by DB-IP's CC BY 4.0 license: credit DB-IP.com wherever this country data is shown."
