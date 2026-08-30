# Spike: Streaming Audio to Listeners on Slow/Unreliable Networks

**Date:** 2026-08-03
**Status:** **Deferred — pending real audience/telemetry evidence.** This app currently has no
real user audience, and nothing in this document is backed by an observed problem (no analytics,
no complaints, no error logs — none of that data can exist pre-launch). A multi-perspective
review (infra/streaming, product/validation, SRE/ops, and a skeptical YAGNI pass) independently
converged on the same conclusion: the technical reasoning below is sound, but building anything
past a trivial, free win (§5, Phase 0) is premature. **Do not start Phase 1+ until there is a real
listener complaint or real telemetry showing slow-network pain** — see §6 for what to actually do
in the meantime.

---

## 1. Purpose

Ear Candy listeners on poor connections (rural, mobile data, congested wifi) can experience
slow initial buffering, stalls mid-episode, or wasted data on episodes they abandon early. This
document surveys the landscape of techniques for making audio playback more resilient on bad
networks, evaluates each against this app's philosophy (small, self-hosted, single admin, no
ops team, avoid infra sprawl), and recommends a path. **This is a spike, not a plan to execute
immediately** — the "Phased Plan" section is what we'd do if/when we decide to act on this, and
per the status above, that decision point hasn't arrived yet.

---

## 2. What We Already Have

Worth stating plainly, because it's more than a "does nothing" baseline:

- **Real HTTP Range request support** (`server/tests/audio-range.test.ts`, gotcha #17a) — the
  browser's native `<audio>` element can seek into an unbuffered portion of a file and the
  server correctly returns `206 Partial Content`. This is the single most important primitive
  for "slow network" resilience and we're not missing it.
- **Progressive download, not eager full-file fetch.** The browser buffers ahead of the
  playhead and pauses/resumes fetching as needed — this is standard `<audio>` behavior and
  requires no app code.
- **A real loading/buffering/error/retry state machine** (`playerStore`, issue #82/#83) driven
  by native `waiting`/`stalled`/`playing`/`error` events, with a `retryPlayback()` affordance.
  Listeners on a bad connection get accurate feedback and a way to recover, not a silently
  frozen progress bar.
- **Eager resume-position saves** (issue #85) — a dropped connection or closed tab doesn't lose
  more than a few seconds of position, so re-buffering on retry is cheap.

In other words: the *transport* layer (Range requests) and the *UX* layer (buffering/error/retry
feedback) are both already solid. What's missing is entirely on the **content** side — we always
serve the one full-quality file that was uploaded, with no smaller/adaptive alternative and no
awareness of the listener's actual network conditions.

---

## 3. Option Survey

### 3.1 Adaptive bitrate streaming (HLS / DASH)

Segment each episode into a few-second chunks at multiple bitrates, serve a manifest, and let a
player (native HLS on Safari/iOS, `hls.js` everywhere else) switch renditions in real time based
on measured throughput.

**What it requires:**
- `ffmpeg` in the build (new native dependency, new Docker stage — server currently has zero
  audio-processing tooling).
- A transcode+segment step per upload, per rendition (e.g. 3 renditions × several hundred
  segments per episode) — meaningfully more CPU and wall-clock time than `sharp`'s one-shot
  image resize.
- Manifest generation/serving, a new client dependency (`hls.js`, ~30-50KB), and non-trivial
  player rework — `AudioPlayerView.tsx`'s hidden native `<audio>` element would need to become
  `hls.js`-attached instead, with its own error/recovery model to reconcile with our existing
  buffering/error state machine.
- Storage: 2-3x the audio storage per episode (multiple renditions + segment overhead), on a
  single Droplet with no CDN/object storage today.

**Verdict: overkill.** ABR exists to solve *video's* problem — video bitrates span 500kbps to
20+ Mbps depending on resolution, so picking wrong is catastrophic and conditions change
mid-playback as available bandwidth fluctuates relative to a huge working set. Podcast audio
bitrates span a much narrower band (32-192kbps), the file sizes are small enough that even a
"low" connection can usually sustain the full bitrate once buffered a few seconds ahead, and our
single-process/single-admin/no-ops-team constraint makes the segmenting+manifest+multi-rendition
machinery a poor trade for the problem size. This is the kind of infrastructure this app is
explicitly trying to avoid (see CLAUDE.md: "self-hostable," "single admin," Dockerfile kept
minimal).

### 3.2 Single lower-bitrate variant (recommended direction)

Instead of full ABR, transcode one additional low-bitrate variant per episode (e.g. 48-64kbps
mono Opus/AAC) at upload time, store it alongside the original, and let the client choose which
`src` to request — either via a manual "data saver" toggle, or automatically based on a coarse
network signal (see 3.5).

**What it requires:**
- `ffmpeg` (still a new dependency, but a single one-shot transcode per upload — directly
  analogous to how `sharp` already runs synchronously at upload time for cover art thumb/detail
  variants, per gotcha #17). No segmenting, no manifest, no new client streaming library — the
  existing native `<audio>` element just gets handed a different URL.
- One extra stored file per episode (roughly 1/3 to 1/2 the size of a typical spoken-word
  128kbps mp3 original, since low-bitrate mono spoken word holds up well) — modest storage cost,
  nothing like ABR's multi-rendition overhead.
- A `duration_seconds`-style DB column addition (e.g. `audio_path_lowres`), following the
  existing additive/nullable migration pattern (gotcha on `migrate.ts`).
- Client: a toggle or auto-detected preference, and picking the right `src` when constructing
  the player's episode. `isValidMediaPath` and the upload magic-byte validation (gotcha #18a)
  extend naturally to a second file.

**Verdict: this is the sweet spot.** One transcode, one extra file, no new streaming protocol,
no new player. It directly addresses the actual failure mode (large file vs. slow pipe) without
adopting infrastructure sized for video. Opus in particular is worth calling out — at 48-64kbps
mono it holds up dramatically better for spoken-word content than mp3 at the same bitrate, so
"low bitrate" doesn't have to mean "noticeably worse," especially for a podcast (talk, not music).

**Caveat if this is ever built — container matters, not just codec.** Opus-in-Ogg (the most
common/default muxing) is not reliably decodable by Safari/iOS's native `<audio>` element —
Apple's Opus support has historically been picky about container. Opus-in-CAF or Opus-in-fMP4/M4A
would need to be the actual target container to avoid silently breaking playback for a real slice
of listeners (iOS Safari share is not negligible for a public podcast audience). This must be
verified against current Safari behavior at build time, not assumed from the codec name alone.

### 3.3 Preloading / prefetch strategies

- `<audio preload="metadata">` (fetch just enough to know duration, not the whole file) vs.
  `"auto"` (browser may eagerly buffer) vs. `"none"`. Worth auditing what `AudioPlayerView.tsx`
  currently sets — if it's `"auto"` or unset (`"auto"` is the spec default absent the attribute),
  every episode view eagerly starts pulling data even before Play is pressed, which is wasted
  bytes on a metered/slow connection for episodes a listener only glances at (browsing-vs-playing
  is already a hard decoupling per gotcha #40 — `preload` should probably respect that same
  spirit: don't fetch until there's real intent).
- Prefetching the *next* episode: **not recommended** for this app. It's a bandwidth cost with
  no clear payoff for a podcast (unlike a video binge-queue), actively bad for data-conscious
  listeners on slow networks (the exact audience this spike is about), and adds real complexity
  (cancellation on season switch, etc.) for a speculative win. Skip.
- Service-worker caching of in-flight audio bytes for resilience across a flaky-but-not-dead
  connection: interesting in theory, real complexity in practice (cache invalidation, storage
  quota, another failure mode to debug) for a benefit largely already covered by (a) the browser
  doing its own internal buffering and (b) our eager resume-position save meaning a dropped
  connection only costs a few seconds of re-buffering, not lost progress. Not worth it here.

**Verdict:** auditing/tightening `preload` is a real, cheap, low-risk win. Prefetch-next-episode
and service-worker audio caching are complexity that doesn't match this app's size or listener
need — skip both.

### 3.4 Client-side network awareness (Network Information API)

`navigator.connection.effectiveType` / `.saveData` / `.downlink` can inform an automatic choice
between the original and a low-bitrate variant (3.2), or drive a one-time "you're on a slow
connection — switch to data-saver audio?" prompt.

**Caveats that matter:** support is Chromium-only in any meaningful way — **no support at all in
Safari or Firefox**, which for a public podcast listener base (unknown device mix, likely
meaningful iOS Safari share) means this can never be the *only* mechanism. `saveData` (the user's
own OS/browser-level data-saver preference) is the most reliable and lowest-effort signal where
it exists — a simple, honest respect of a device setting the listener already opted into,
requiring no guesswork about "slow."

**Verdict:** treat as a *nice-to-have automatic default*, never a replacement for a manual
toggle. Given the poor cross-browser support, a persistent, discoverable **manual "data saver"
setting** (localStorage-persisted, same pattern as the existing theme preference) is the
higher-value, lower-risk piece to build — auto-detection via `saveData`/`effectiveType` is a
reasonable enhancement layered on top for the browsers that support it, not a prerequisite.

### 3.5 Transcoding pipeline mechanics (if 3.2 is pursued)

- **Eager, at upload time** (mirrors `sharp`'s existing synchronous cover-art resize):
  simplest mental model, matches the codebase's existing upload-time-processing convention, and
  keeps read-path code (serving `/audio/`) completely unchanged — no on-demand transcode latency
  ever hits a listener. Cost: upload requests take longer (an admin-only, infrequent operation —
  acceptable), and a moderately-sized podcast library means occasional Droplet CPU spikes at
  upload time, not steady-state load.
  **Important caveat, not just a footnote:** this is *not* actually analogous to `sharp` in
  concurrency terms. `sharp`'s resize is sub-second; transcoding several minutes of audio via
  ffmpeg is tens of seconds at least. If invoked as a blocking child-process call inline in the
  request handler on the same single Fastify process that also owns the single, synchronous
  `better-sqlite3` connection, a slow transcode risks visibly delaying unrelated concurrent
  requests (e.g. a listener's `GET /api/episodes`) for the duration — a new failure mode this app
  doesn't have today. If this is ever built, the transcode must be a genuinely detached/spawned
  subprocess (not a blocking wrapper) and this needs explicit verification under concurrent load,
  not an assumption carried over from the `sharp` pattern.
- **Lazy/on-demand with caching:** defers the CPU cost until (if ever) a low-bitrate variant is
  actually requested, avoiding wasted transcodes for episodes nobody ever needs the small version
  of. Real added complexity for this app's size, though: a cache layer, a "is the transcode
  already in flight" lock (concurrent listener requests for the same never-yet-transcoded
  episode), and a new failure mode (transcode fails mid-request) that the always-available
  original file never has. Given a single-podcast app's episode volume, the eager approach's
  worst case (some upload-time CPU spikes) is much easier to reason about than the lazy
  approach's added moving parts.

**Verdict:** eager, upload-time transcoding — consistent with the existing `sharp` pattern,
simplest failure mode, and the right trade for this app's scale.

### 3.6 Other lightweight techniques worth naming (not core recommendations)

- **Opus over mp3/AAC at low bitrates** — already folded into 3.2's recommendation; worth
  restating as the specific format choice if/when this is built, since spoken-word content is
  exactly Opus's strong suit.
- **A CDN in front of Caddy (e.g. Cloudflare) for repeat-listener/global-latency wins** — a
  legitimately cheap, high-leverage change (mostly DNS + config, no application code) for
  *latency to first byte* and reducing origin load, but it's orthogonal to "slow last-mile
  connection" (a CDN doesn't fix a listener's own poor wifi/cellular throughput) — worth a
  separate, smaller spike of its own someday, not a substitute for anything above.
- **Chunked transfer nuances:** not relevant here — Range + `Content-Length` (what
  `@fastify/static` already does) is the correct mechanism for seekable media; chunked transfer
  encoding is for streams of unknown total length, which doesn't describe a stored audio file.

---

## 4. Recommendation

**Do not build ABR/HLS.** It solves a problem sized for video, at a build/ops cost this app is
explicitly designed to avoid.

**Do, eventually, build the single-low-bitrate-variant approach (3.2)**, backed by:
- Eager Opus transcoding at upload time (3.5), following the existing `sharp`-at-upload-time
  convention.
- A persistent, manual "data saver" listener preference (3.4) as the primary control — simple,
  honest, works in every browser.
- `navigator.connection.saveData`/`effectiveType` as an optional automatic nudge/default where
  supported, never load-bearing.
- A `preload` audit (3.3) as a genuinely free, immediate improvement independent of everything
  else — worth doing regardless of whether the rest of this is ever built.

This reasoning follows the same shape as this app's other infrastructure decisions to date:
prefer the smallest mechanism that actually addresses the observed problem (see: WAL-mode SQLite
over a client-server DB, a single monolithic Docker image over microservices, no user model
beyond one admin password). ABR is real, proven technology — it's just proven for a problem
(multi-Mbps video bitrate ranges, continuously fluctuating mid-playback bandwidth needs) that
podcast audio doesn't actually have.

---

## 5. Phased Plan (for future reference — not started, and not to be started yet)

**This entire section is frozen pending the evidence described in §6.** None of it should begin
until there's a real listener complaint or real telemetry showing slow-network pain — see §6.

If/when we decide to act on the recommendation above:

**Phase 0 — free win, do independently of everything else:**
- Audit and, if needed, correct the `<audio>` element's `preload` attribute in
  `AudioPlayerView.tsx` so browsing (not playing) never eagerly pulls audio bytes, consistent
  with the existing browsing-vs-playing decoupling (gotcha #40).

**Phase 1 — manual data-saver preference (no transcoding yet):**
- Add a `localStorage`-persisted "data saver" toggle (`useTheme`-style hook), surfaced in the
  mobile Settings screen and/or desktop settings — UI-only, no server changes, no effect until
  Phase 2 gives it something to switch to.

**Phase 2 — upload-time low-bitrate transcode:**
- Add `ffmpeg` to the server's Docker build (new stage, mirroring how `sharp`'s native deps are
  isolated to the deps-compiling stage already).
- Guarded additive migration: `episodes.audio_path_lowres` (nullable), following the existing
  `MIGRATIONS` array pattern.
- Extend `routes/admin/upload.ts` to also produce a 48-64kbps mono Opus variant synchronously at
  upload time, validated the same way as the original (magic bytes, `isValidMediaPath`).
- One-off backfill script (following the `server/scripts/backfill-durations.mjs` pattern) for
  episodes uploaded before this feature existed.

**Phase 3 — wire the preference to playback:**
- `AudioPlayer`/`AudioPlayerView` pick `audio_path_lowres` vs `audio_path` based on the Phase 1
  toggle.
- Layer in `navigator.connection.saveData` as an automatic default for the toggle's initial
  value (never override an explicit manual choice), feature-detected and silently absent on
  unsupported browsers.

**Phase 4 — verification:**
- Server unit tests for the new upload path (mirroring `audio-range.test.ts`'s rigor).
- Client tests for the toggle and `src`-selection logic.
- E2E: extend `e2e/tests/` with a data-saver-toggle flow, being mindful of the existing note
  (gotcha #31) that real audio decoding is unreliable in CI's headless Chromium — assert on the
  selected `src`/network request, not on successful playback.

This phasing is intentionally incremental — each phase ships independent value and none commits
us to the next, so we can stop after Phase 1 (manual preference alone, once there's a real
low-bitrate file to point it at is still needed for it to matter) or Phase 0 alone if the rest
turns out not to be worth it once revisited.

---

## 6. What to actually do next (instead of Phases 1-4)

A multi-perspective review of this spike (infra/streaming engineer, product/lean-validation,
SRE/ops, and a deliberately skeptical YAGNI pass) independently converged on the same point: the
technical analysis above is sound, but there is currently **zero evidence this is a real problem
for Ear Candy's actual listeners**, because there are no listeners yet to generate that evidence.
Building a transcoding pipeline, a new DB column, and a client toggle against a hypothetical
audience is exactly the kind of speculative infrastructure this app's own philosophy argues
against.

The cheap, no-build way to keep this option open without committing to it:

- **Log the playback events that already exist.** `playerStore`'s `error`/`loading` state is
  already driven by real `waiting`/`stalled`/`playing`/`error` `<audio>` events (issues #82/#83),
  but nothing durable captures them today — they only ever affect in-session UI state. Sending a
  lightweight beacon (or even just structured client-side logging surfaced somewhere an admin can
  glance at) when `error` or a prolonged `loading`/stalled state occurs would be the actual signal
  that tells us, cheaply, whether slow-network pain is real — without building any fix in advance
  of knowing it's needed.
- **Revisit this document once that signal exists** (or once real listener feedback says so
  directly) — at that point, §3-5 above are ready to act on as-is, modulo re-verifying the Safari/
  Opus container caveat (§3.2) and the ffmpeg-concurrency caveat (§3.5) against whatever the
  codebase looks like by then.
- Until then: **Phase 0 (the `preload` audit) is the only piece of this worth doing without
  waiting for evidence**, since it's free, low-risk, and arguably just a correctness fix
  independent of whether slow networks ever turn out to be a real problem here — and even that
  should be picked up as part of unrelated, real work touching `AudioPlayerView.tsx`, not
  scheduled as a standalone task.
