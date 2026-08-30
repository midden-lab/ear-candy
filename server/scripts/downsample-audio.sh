#!/usr/bin/env bash
# One-off maintenance script: downsamples published upload-type episode audio
# from 192kbps to 128kbps stereo mp3, in place, on the production Droplet.
#
# Why: every published episode was uploaded at 192kbps CBR stereo mp3 (a
# DAW/export default, not a deliberate choice). 128kbps stereo is a
# well-established "high quality" target for spoken-word content and cuts
# file size by ~33% with no perceptible quality loss for voice, directly
# helping listeners on slow connections. This is a one-off content operation,
# NOT the deferred low-bitrate-variant feature in
# plans/archive/2026-08-03-slow-network-audio-streaming-spike.md (still shelved).
#
# Runs entirely on the Droplet, using the already-deployed app image (to read
# the episode list from the real DB) and a pinned ffmpeg image (to transcode).
# Filenames are preserved (in-place swap), so this needs NO database writes:
# audio_path is unchanged, and bitrate doesn't affect duration_seconds.
#
# Usage (run FROM the Droplet, per CLAUDE.md gotcha #37's pattern):
#   scp server/scripts/downsample-audio.sh earcandy:/opt/ear-candy/
#   ssh earcandy
#   bash /opt/ear-candy/downsample-audio.sh              # dry run
#   bash /opt/ear-candy/downsample-audio.sh --apply      # actually transcode
#   rm /opt/ear-candy/downsample-audio.sh                # clean up afterward
#
# Safety:
#   - Backs up every original to /opt/ear-candy/backups/audio-192k/ before
#     touching it (outside data/uploads/, which is publicly served at
#     /audio/ — a backup subdir inside it would be web-reachable).
#   - Skips files already at/below the target bitrate (idempotent re-run).
#   - Transcodes to a temp file, verifies duration/size, THEN atomically
#     `mv`s over the original — a failed transcode never touches the source.
#   - Writes as uid:gid 1000:1000 to match the production container's
#     non-root user (CLAUDE.md gotcha #33a) — a root-owned file dropped into
#     the bind-mounted data dir is exactly the class of bug that produced
#     SQLITE_READONLY before.
#
# Rollback: cp /opt/ear-candy/backups/audio-192k/*.mp3 /opt/ear-candy/data/uploads/
#           then chown 1000:1000 the restored files.
#
# STATUS: run against production on 2026-08-06 (--apply). Transcoded all 5
# published upload-type episodes (#96-#100) from 192kbps to 128kbps stereo
# mp3, 413MB -> 275MB total. Originals backed up to
# /opt/ear-candy/backups/audio-192k/ on the droplet (not pruned automatically
# — delete manually once satisfied). Verified post-run: correct uid:gid
# 1000:1000 ownership, HTTP Range requests still return 206 with a
# Content-Range matching the new file sizes, /api/health green. Idempotent
# and safe to re-run against any future upload that lands above 128kbps, but
# no further action is expected under normal operation.

set -euo pipefail

DATA_DIR="/opt/ear-candy/data"
UPLOADS_DIR="$DATA_DIR/uploads"
BACKUP_DIR="/opt/ear-candy/backups/audio-192k"
TMP_DIR="$DATA_DIR/.transcode-tmp"
TARGET_KBPS=128
FFMPEG_IMAGE="jrottenberg/ffmpeg:7-alpine"
APPLY=false

for arg in "$@"; do
  if [[ "$arg" == "--apply" ]]; then
    APPLY=true
  fi
done

if [[ "$APPLY" == true ]]; then
  echo "APPLY mode — files will be transcoded and replaced."
else
  echo "DRY RUN — no files will be changed. Pass --apply to write."
fi
echo

APP_IMAGE="$(docker inspect ear-candy --format='{{.Config.Image}}')"
if [[ -z "$APP_IMAGE" ]]; then
  echo "Could not resolve the running ear-candy container's image. Aborting." >&2
  exit 1
fi

# Resolve targets from the DB, not the filesystem — this is what keeps any
# orphaned/unreferenced upload files out of scope. Also pull duration_seconds
# to use as the ground-truth duration for post-transcode verification below —
# ffprobe estimating an mp3's own duration from its bitrate (no exact header)
# is measurably less accurate than the value already stored in the DB.
mapfile -t ROWS < <(docker run --rm \
  -v "$DATA_DIR:/app/data:ro" -w /app "$APP_IMAGE" \
  node -e "
    const Database = require('better-sqlite3');
    const db = new Database('data/db.sqlite', { readonly: true, fileMustExist: true });
    const rows = db.prepare(\"SELECT audio_path, duration_seconds FROM episodes WHERE audio_type = 'upload'\").all();
    for (const r of rows) console.log(r.audio_path + '\t' + r.duration_seconds);
  ")

if [[ ${#ROWS[@]} -eq 0 ]]; then
  echo "No upload-type episodes found. Nothing to do."
  exit 0
fi

echo "Found ${#ROWS[@]} upload-type episode(s) referenced in the DB."
echo

mkdir -p "$TMP_DIR"
# The ffmpeg container writes as uid:gid 1000:1000 (matching the production
# container's non-root user, gotcha #33a) — make sure it can actually write
# into this directory regardless of which user this script itself runs as.
chown 1000:1000 "$TMP_DIR" 2>/dev/null || chmod 777 "$TMP_DIR"
if [[ "$APPLY" == true ]]; then
  mkdir -p "$BACKUP_DIR"
fi

TOTAL_BEFORE=0
TOTAL_AFTER=0
CHANGED=0
SKIPPED=0

for row in "${ROWS[@]}"; do
  audio_path="${row%%$'\t'*}"
  db_duration="${row##*$'\t'}"
  filename="${audio_path#/audio/}"
  src="$UPLOADS_DIR/$filename"

  if [[ ! -f "$src" ]]; then
    echo "  [skip] $filename — file not found on disk"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  src_bytes=$(stat -c%s "$src" 2>/dev/null || stat -f%z "$src")
  TOTAL_BEFORE=$((TOTAL_BEFORE + src_bytes))

  current_kbps=$(docker run --rm --entrypoint ffprobe -v "$UPLOADS_DIR:/audio:ro" "$FFMPEG_IMAGE" \
    -v error -select_streams a:0 -show_entries stream=bit_rate \
    -of default=noprint_wrappers=1:nokey=1 "/audio/$filename" 2>/dev/null || echo "")
  if [[ -z "$current_kbps" || "$current_kbps" == "N/A" ]]; then
    # Fall back to container-level bitrate if the stream doesn't report one.
    current_kbps=$(docker run --rm --entrypoint ffprobe -v "$UPLOADS_DIR:/audio:ro" "$FFMPEG_IMAGE" \
      -v error -show_entries format=bit_rate \
      -of default=noprint_wrappers=1:nokey=1 "/audio/$filename")
  fi
  current_kbps=$((current_kbps / 1000))

  if [[ "$current_kbps" -le "$TARGET_KBPS" ]]; then
    echo "  [skip] $filename — already ${current_kbps}kbps (<= ${TARGET_KBPS}kbps target)"
    TOTAL_AFTER=$((TOTAL_AFTER + src_bytes))
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo "  [$([[ "$APPLY" == true ]] && echo transcoding || echo "would transcode")] $filename — ${current_kbps}kbps -> ${TARGET_KBPS}kbps"

  if [[ "$APPLY" != true ]]; then
    # Estimate for the dry-run table only.
    est_bytes=$((src_bytes * TARGET_KBPS / current_kbps))
    TOTAL_AFTER=$((TOTAL_AFTER + est_bytes))
    CHANGED=$((CHANGED + 1))
    continue
  fi

  # Back up the original once, before any transcode of this file.
  backup="$BACKUP_DIR/$filename"
  if [[ ! -f "$backup" ]]; then
    cp "$src" "$backup"
  fi

  tmp_out="$TMP_DIR/$filename"
  rm -f "$tmp_out"

  docker run --rm --user 1000:1000 \
    -v "$UPLOADS_DIR:/in:ro" -v "$TMP_DIR:/out" "$FFMPEG_IMAGE" \
    -y -i "/in/$filename" \
    -c:a libmp3lame -b:a "${TARGET_KBPS}k" -ac 2 -ar 48000 \
    -map_metadata 0 -id3v2_version 3 \
    "/out/$filename"

  if [[ ! -f "$tmp_out" ]]; then
    echo "    [FAILED] $filename — ffmpeg produced no output, original left untouched"
    TOTAL_AFTER=$((TOTAL_AFTER + src_bytes))
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  out_duration=$(docker run --rm --entrypoint ffprobe -v "$TMP_DIR:/audio:ro" "$FFMPEG_IMAGE" \
    -v error -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 "/audio/$filename" 2>/dev/null || echo 0)
  out_bytes=$(stat -c%s "$tmp_out" 2>/dev/null || stat -f%z "$tmp_out")

  # Compared against the DB's stored duration_seconds (ground truth, set by
  # the original upload-time probe), not a fresh ffprobe of the source file —
  # ffprobe warns "Estimating duration from bitrate, this may be inaccurate"
  # on these particular mp3s and was measurably off (~5s) in practice.
  duration_diff=$(awk -v a="$db_duration" -v b="$out_duration" 'BEGIN { d = a - b; if (d < 0) d = -d; print d }')
  duration_ok=$(awk -v d="$duration_diff" 'BEGIN { print (d <= 2) ? "1" : "0" }')

  if [[ "$duration_ok" != "1" ]]; then
    echo "    [FAILED] $filename — duration mismatch (db ${db_duration}s, out ${out_duration}s), original left untouched"
    rm -f "$tmp_out"
    TOTAL_AFTER=$((TOTAL_AFTER + src_bytes))
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  if [[ "$out_bytes" -ge "$src_bytes" ]]; then
    echo "    [FAILED] $filename — output not smaller than source, original left untouched"
    rm -f "$tmp_out"
    TOTAL_AFTER=$((TOTAL_AFTER + src_bytes))
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  mv "$tmp_out" "$src"
  echo "    [ok] $filename — $((src_bytes / 1024 / 1024))MB -> $((out_bytes / 1024 / 1024))MB"
  TOTAL_AFTER=$((TOTAL_AFTER + out_bytes))
  CHANGED=$((CHANGED + 1))
done

rmdir "$TMP_DIR" 2>/dev/null || true

echo
echo "$([[ "$APPLY" == true ]] && echo "Transcoded" || echo "Would transcode") ${CHANGED} file(s), skipped ${SKIPPED}."
echo "Total: $((TOTAL_BEFORE / 1024 / 1024))MB -> $((TOTAL_AFTER / 1024 / 1024))MB"
if [[ "$APPLY" != true ]]; then
  echo "Run again with --apply to write these changes."
fi
