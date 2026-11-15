---
name: prod-maintenance-scripts
description: Run or write one-off maintenance scripts (backfill-durations, downsample-audio) against the production Droplet via a throwaway container, or use the local downsample-audio-dir.sh tool. Use before touching server/scripts/ or scp-ing a script to the Droplet.
---

# Production maintenance scripts

37. **One-off maintenance scripts live in `server/scripts/`, run against production via a throwaway container.** E.g. `backfill-durations.mjs` populates `duration_seconds` for upload-type episodes that predate the auto-detect-on-save feature, or whose client-side probe silently failed at save time (confirmed root cause for a real recurrence, plans/013: an 8s timeout in `EpisodeFormPanel.tsx`'s `probeAudioDuration` is too short for large — ~57-58MB — uploaded files). Already run against production three times: 2026-07-13 (episodes #96-#100), and 2026-09-08 with the script's newer `--season-id` filter (Season 1's remaining #101-122) — see the script's own header for full status; it's idempotent and safe to re-run per-season as the gap resurfaces elsewhere (Seasons 2-4 still have ~44 affected episodes, not yet backfilled). URL-type episodes never needed this — they self-heal automatically (re-probed unconditionally on every save); upload-type only re-probes when a new file is explicitly re-selected. `downsample-audio.sh` is a similar one-off: it re-encodes published upload-type episode audio from its as-uploaded 192kbps down to 128kbps stereo mp3 in place on the Droplet (a DAW/export-default bitrate that was never a deliberate choice), backing up originals to `/opt/ear-candy/backups/audio-192k/` first and preserving filenames so it needs zero DB writes — see the script's own header for status/idempotency details. Unlike `backfill-durations.mjs` (pure Node against the DB), this one is bash because it orchestrates two separate containers — the deployed app image (to read the episode list) and a pinned `ffmpeg` image (to transcode) — neither of which has both capabilities alone. Pattern for running one of these against production:
    ```bash
    # from local machine, with an SSH config alias set up for the Droplet:
    scp server/scripts/<script>.mjs earcandy:/opt/ear-candy/
    ssh earcandy
    # on the Droplet — mounts the real data dir into a disposable container
    # sharing the already-deployed image; never touches the live `ear-candy`
    # container itself:
    docker run --rm \
      -v /opt/ear-candy/data:/app/data \
      -v /opt/ear-candy/<script>.mjs:/app/<script>.mjs \
      -w /app \
      $(docker inspect ear-candy --format='{{.Config.Image}}') \
      sh -c 'mkdir -p /tmp/scratch && cd /tmp/scratch && npm init -y >/dev/null 2>&1 && \
             npm install <any-needed-devDependency> --silent >/dev/null 2>&1 && \
             cp -r node_modules/. /app/node_modules/ && cd /app && node <script>.mjs'   # dry run first if the script supports one
    # review output, then re-run with --apply (or whatever the script's write flag is)
    # to actually write. Delete the copied script from /opt/ear-candy/ afterward —
    # it's not meant to persist there.
    ```
    Any library a one-off script needs (e.g. `music-metadata`, pure JS, no native compile needed) should be added as a server devDependency only — never part of the production image, since the Dockerfile's `deps` stage runs `npm ci --omit=dev`. **Do not run `npm install <pkg> --no-save` directly in `/app`** — confirmed directly (plans/013): it silently no-ops ("up to date, audited N packages", nothing actually added) when `NODE_ENV=production` (set in the deployed image) combines with `/app`'s own `package-lock.json`, with no error to signal the failure — the script then dies with `ERR_MODULE_NOT_FOUND` on the very first `import`. Installing into an unrelated scratch directory and copying the result into `/app/node_modules` (as above) sidesteps this entirely. `NODE_PATH` does **not** work as a fix here even though it looks like it should — it only affects CommonJS `require()` resolution, not ESM `import`, and this codebase's scripts are all ESM.

37a. **`scripts/downsample-audio-dir.sh` (repo root, not `server/scripts/`) is a general-purpose LOCAL tool, not a one-off run against production.** Point it at any local directory of audio files and it downsamples each to a target bitrate (default 128kbps) via ffmpeg, writing the output alongside the original with the bitrate in the filename (e.g. `Episode 12.mp3` → `Episode 12-128k.mp3`) — it never modifies or deletes the source. It prefers a local `ffmpeg`/`ffprobe` on `PATH` and otherwise falls back to the same pinned `jrottenberg/ffmpeg:7-alpine` Docker image the production `downsample-audio.sh` uses, so it needs zero local setup beyond Docker. That image is amd64-only, so it runs under emulation on Apple Silicon (confirmed working, just slower) — `brew install ffmpeg` avoids that. Written to be portable to macOS's stock bash 3.2 (no `declare -A`; codec-by-extension lookup is a `case` statement instead) since that's what ships on a Mac with no dev tooling installed.
