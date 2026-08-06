#!/usr/bin/env bash
# General-purpose LOCAL tool: downsample every audio file in a directory to a
# target bitrate (default 128kbps), for shrinking podcast masters/exports
# before uploading via the admin panel.
#
# Unlike server/scripts/downsample-audio.sh (a one-off that transcodes
# published episodes IN PLACE directly on the production Droplet, already
# run — see that script's own STATUS header), this tool runs entirely on
# your local machine against any directory you point it at, and NEVER
# modifies or deletes the originals: each output is written alongside its
# source with the target bitrate in the filename, e.g.
#   Episode 12.mp3  ->  Episode 12-128kbps.mp3
# so the final bitrate is obvious at a glance in a file listing.
#
# Uses a locally installed ffmpeg/ffprobe if you have them; otherwise falls
# back to the same pinned `jrottenberg/ffmpeg:7-alpine` Docker image the
# production script uses, so it works with zero local setup beyond Docker.
# That image is amd64-only, so on Apple Silicon Docker runs it under
# emulation — functional (confirmed) but noticeably slower than native.
# `brew install ffmpeg` avoids that entirely and this script will prefer it
# automatically once it's on PATH.
#
# Usage:
#   scripts/downsample-audio-dir.sh <directory> [--apply] [--bitrate 128k] [--force]
#
#   <directory>   Directory containing audio files (searched non-recursively)
#   --apply       Actually write output files (default: dry run — lists what
#                 would happen without touching anything)
#   --bitrate Nk  Target bitrate, default 128k
#   --force       Re-encode even if a "-<bitrate>" output file already exists
#
# Supported extensions -> codec: mp3 (libmp3lame), m4a/aac (aac), ogg (libvorbis).
# Other extensions are ignored. A file already at/below the target bitrate is
# skipped (no re-encode). A file whose name already ends in "-<bitrate>" is
# treated as a prior output of this script and skipped, so re-running is safe.
#
# Example:
#   scripts/downsample-audio-dir.sh ~/Desktop/podcast-masters
#   scripts/downsample-audio-dir.sh ~/Desktop/podcast-masters --apply

set -euo pipefail

FFMPEG_IMAGE="jrottenberg/ffmpeg:7-alpine"
SUPPORTED_EXTS="mp3 m4a aac ogg"

# Portable stand-in for an associative array — macOS ships bash 3.2, which
# has no `declare -A`, and this script needs to run with zero local setup.
codec_for_ext() {
  case "$1" in
    mp3) echo "libmp3lame" ;;
    m4a|aac) echo "aac" ;;
    ogg) echo "libvorbis" ;;
    *) echo "" ;;
  esac
}

DIR=""
APPLY=false
BITRATE="128k"
FORCE=false

usage() {
  echo "Usage: $0 <directory> [--apply] [--bitrate 128k] [--force]" >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=true; shift ;;
    --bitrate) BITRATE="$2"; shift 2 ;;
    --force) FORCE=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *)
      if [[ -z "$DIR" ]]; then DIR="$1"; shift; else echo "Unexpected argument: $1" >&2; usage; exit 1; fi
      ;;
  esac
done

if [[ -z "$DIR" ]]; then
  usage
  exit 1
fi
if [[ ! -d "$DIR" ]]; then
  echo "Not a directory: $DIR" >&2
  exit 1
fi
DIR="$(cd "$DIR" && pwd)"

TARGET_KBPS="${BITRATE%k}"

USE_DOCKER=false
if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "Neither a local ffmpeg/ffprobe nor docker was found. Install one of them." >&2
    exit 1
  fi
  USE_DOCKER=true
  echo "Local ffmpeg/ffprobe not found — using Docker image $FFMPEG_IMAGE instead."
fi

if [[ "$APPLY" == true ]]; then
  echo "APPLY mode — files will be written to $DIR"
else
  echo "DRY RUN — no files will be written. Pass --apply to write."
fi
echo "Target bitrate: $BITRATE"
echo

ffprobe_run() {
  local file="$1"; shift
  if [[ "$USE_DOCKER" == true ]]; then
    docker run --rm --entrypoint ffprobe -v "$DIR:/audio:ro" "$FFMPEG_IMAGE" "$@" "/audio/$file"
  else
    ffprobe "$@" "$DIR/$file"
  fi
}

ffmpeg_run() {
  local infile="$1" outfile="$2"; shift 2
  if [[ "$USE_DOCKER" == true ]]; then
    docker run --rm --user "$(id -u):$(id -g)" -v "$DIR:/audio" "$FFMPEG_IMAGE" \
      -y -i "/audio/$infile" "$@" "/audio/$outfile"
  else
    ffmpeg -y -i "$DIR/$infile" "$@" "$DIR/$outfile"
  fi
}

file_size() {
  stat -f%z "$1" 2>/dev/null || stat -c%s "$1"
}

shopt -s nullglob nocaseglob
FILES=()
for ext in $SUPPORTED_EXTS; do
  for f in "$DIR"/*."$ext"; do
    FILES+=("$(basename "$f")")
  done
done
shopt -u nullglob nocaseglob

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "No supported audio files found in $DIR (looked for: $SUPPORTED_EXTS)"
  exit 0
fi

echo "Found ${#FILES[@]} candidate audio file(s)."
echo

TOTAL_BEFORE=0
TOTAL_AFTER=0
CHANGED=0
SKIPPED=0

for filename in "${FILES[@]}"; do
  ext="${filename##*.}"
  ext_lower="$(echo "$ext" | tr '[:upper:]' '[:lower:]')"
  base="${filename%.*}"

  if [[ "$base" == *"-${BITRATE}" ]]; then
    echo "  [skip] $filename — looks like an already-downsampled output of this script"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  codec="$(codec_for_ext "$ext_lower")"
  [[ -z "$codec" ]] && continue

  outfile="${base}-${BITRATE}.${ext_lower}"

  if [[ -f "$DIR/$outfile" && "$FORCE" != true ]]; then
    echo "  [skip] $filename — $outfile already exists (use --force to redo)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  current_bps=$(ffprobe_run "$filename" -v error -select_streams a:0 -show_entries stream=bit_rate \
    -of default=noprint_wrappers=1:nokey=1 2>/dev/null || echo "")
  if [[ -z "$current_bps" || "$current_bps" == "N/A" ]]; then
    current_bps=$(ffprobe_run "$filename" -v error -show_entries format=bit_rate \
      -of default=noprint_wrappers=1:nokey=1 2>/dev/null || echo 0)
  fi
  current_kbps=$((current_bps / 1000))

  if [[ "$current_kbps" -gt 0 && "$current_kbps" -le "$TARGET_KBPS" ]]; then
    echo "  [skip] $filename — already ${current_kbps}kbps (<= ${TARGET_KBPS}kbps target)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  src_bytes=$(file_size "$DIR/$filename")
  TOTAL_BEFORE=$((TOTAL_BEFORE + src_bytes))

  echo "  [$([[ "$APPLY" == true ]] && echo downsampling || echo "would downsample")] $filename (${current_kbps:-?}kbps) -> $outfile"

  if [[ "$APPLY" != true ]]; then
    if [[ "$current_kbps" -gt 0 ]]; then
      est_bytes=$((src_bytes * TARGET_KBPS / current_kbps))
    else
      est_bytes=$src_bytes
    fi
    TOTAL_AFTER=$((TOTAL_AFTER + est_bytes))
    CHANGED=$((CHANGED + 1))
    continue
  fi

  extra_args=()
  [[ "$ext_lower" == "mp3" ]] && extra_args+=(-id3v2_version 3)

  src_duration=$(ffprobe_run "$filename" -v error -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 2>/dev/null || echo 0)

  ffmpeg_run "$filename" "$outfile" -c:a "$codec" -b:a "$BITRATE" -ac 2 -map_metadata 0 "${extra_args[@]}"

  if [[ ! -f "$DIR/$outfile" ]]; then
    echo "    [FAILED] $filename — no output produced"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  out_duration=$(ffprobe_run "$outfile" -v error -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 2>/dev/null || echo 0)
  duration_diff=$(awk -v a="$src_duration" -v b="$out_duration" 'BEGIN { d = a - b; if (d < 0) d = -d; print d }')
  duration_ok=$(awk -v d="$duration_diff" 'BEGIN { print (d <= 2) ? "1" : "0" }')
  if [[ "$duration_ok" != "1" ]]; then
    echo "    [WARNING] $outfile — duration differs from source by ${duration_diff}s (src ${src_duration}s, out ${out_duration}s); original is untouched, review $outfile before using it"
  fi

  out_bytes=$(file_size "$DIR/$outfile")
  echo "    [ok] $outfile — $((src_bytes / 1024 / 1024))MB -> $((out_bytes / 1024 / 1024))MB"
  TOTAL_AFTER=$((TOTAL_AFTER + out_bytes))
  CHANGED=$((CHANGED + 1))
done

echo
echo "$([[ "$APPLY" == true ]] && echo "Downsampled" || echo "Would downsample") ${CHANGED} file(s), skipped ${SKIPPED}."
if [[ "$CHANGED" -gt 0 ]]; then
  echo "Total: $((TOTAL_BEFORE / 1024 / 1024))MB -> $((TOTAL_AFTER / 1024 / 1024))MB"
fi
if [[ "$APPLY" != true ]]; then
  echo "Run again with --apply to write these changes."
fi
