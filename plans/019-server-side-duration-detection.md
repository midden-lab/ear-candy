---
id: server-side-duration-detection
title: "Fix missing episode durations: backfill production + move upload-type detection server-side"
status: complete
priority: 1
created: 2026-10-04
steps_completed: 8
steps_total: 8
tags: [bugfix, production, server, client, audio]
---

# Fix Missing Episode Durations

## Summary

11 production episodes across Seasons 1, 2, and 4 have `duration_seconds = 0` — the third recurrence of a known bug class where `EpisodeFormPanel.tsx`'s client-side duration probe (`probeAudioDuration`, 8000ms timeout) silently fails for this podcast's typical ~55-58MB upload-type episode files, since the probe runs concurrently with the real multipart upload of that same file. This plan backfills the 11 currently-broken production episodes using the existing proven script, then eliminates the bug class itself by moving upload-type duration detection into the server (mirroring how `upload-image.ts` already does real synchronous media processing at upload time), so the client never again races a fixed timeout against a large-file upload.

## Context

**Root cause (fully investigated against live production — do not re-derive):**
- `client/src/pages/admin/EpisodeFormPanel.tsx:31`'s `probeAudioDuration(src, timeoutMs = 8000)` probes a local `URL.createObjectURL` blob of the just-selected file. For upload-type episodes, `handleFileChange` (same file, ~line 90-104) fires this probe *in parallel with* the real `uploadAudio(file)` POST of that same file — the existing doc comment says so explicitly ("in parallel with the actual upload").
- All 11 currently-broken production episodes are `audio_type: 'upload'`, 55-58MB each, all created within one 17-minute admin session (2026-09-15 20:45-21:02) — confirmed via direct SSH inspection of the production DB and `data/uploads/` file sizes.
- Identical signature (same ~55-58MB file-size range, same "whole batch fails together" pattern) already happened twice before and was patched via `server/scripts/backfill-durations.mjs` (2026-07-13: episodes #96-100; 2026-09-08: #101-166). That script's own header comment states plainly the underlying client timeout bug is *not* fixed by the script itself.
- Issue #152 is the already-filed, not-yet-actioned follow-up for exactly this. This plan implements it.

**Existing precedent to follow, not reinvent:**
- `server/scripts/backfill-durations.mjs` already does server-side duration detection via `music-metadata`'s `parseFile(path)` against the on-disk file, rounding to the nearest second (`Math.round(metadata.format.duration)`). Reuse this exact approach in the real upload route.
- `server/src/routes/admin/upload-image.ts` is the established pattern for "server does real synchronous processing at upload time and returns computed values in the response" (sharp thumb/detail generation, returned as `{ thumb, detail }` alongside the usual error handling). The audio route should follow the same shape.
- `server/src/routes/admin/upload.ts` currently streams the uploaded file straight to disk via `pipeline(stream, fs.createWriteStream(dest))` and returns `{ path: `/audio/${filename}` }`. Nothing is buffered in memory (audio uploads can be up to 500MB, unlike the 15MB-capped image route) — duration detection must happen *after* the pipeline completes and the file is fully on disk, reading from that same `dest` path.

**Dependency note:** `music-metadata` (`^11.13.0`) is currently a `devDependency` in `server/package.json` — added only for the one-off backfill script, which per `server/scripts/backfill-durations.mjs`'s own header comment is deliberately kept out of the production image (`npm ci --omit=dev` in the Dockerfile's deps stage). Since this plan adds it to a route that *does* run in production, it must move to `dependencies`. No Dockerfile change is needed beyond that — `music-metadata` is pure JS with no native compile step (confirmed by the same comment), so promoting it is a routine `npm ci --omit=dev`-covered dependency, not a new OS package.

**Decisions already made (do not re-litigate):**
- Detection runs **synchronously** in the upload request/response, matching `upload-image.ts`'s precedent exactly.
- If `music-metadata` can't determine a duration (corrupt file, unusual encoding, throws), **the upload still succeeds** with `duration_seconds: 0` — matches the existing philosophy (`probeAudioDuration`'s own doc comment: "a failed probe never blocks saving"). The file has already passed magic-byte validation as real audio; an unparseable duration is a missing signal, not an invalid upload.
- The client-side local-blob probe for **upload-type** episodes is **deleted entirely**, not kept as a fallback/instant-preview — single source of truth, no dual-path to keep in sync.
- **URL-type episodes are out of scope.** None of the 11 broken episodes are URL-type, the bug mechanism doesn't apply (no concurrent upload to race against), and moving URL-type detection server-side would require the server to fetch an admin-supplied arbitrary URL itself — a new SSRF-shaped concern this incident doesn't warrant opening. `EpisodeFormPanel.tsx`'s at-submit-time URL probing (gotchas #22/#84) is untouched by this plan.

**Files involved:** `server/package.json`/`server/package-lock.json`, `server/src/routes/admin/upload.ts`, `server/tests/admin-upload.test.ts`, `client/src/api.ts`, `client/src/pages/admin/EpisodeFormPanel.tsx`, `client/src/tests/EpisodeFormPanel.test.tsx`, `server/scripts/backfill-durations.mjs` (comment-only correction).

---

## Steps

### Step 1: Backfill the 11 currently-broken production episodes

**Files:** none (operational — production data fix, no code change)

**Requires review:** true — this writes directly to the production database, even via an already-proven, idempotent script.

Run the existing `server/scripts/backfill-durations.mjs` against production, following the exact one-off-script procedure documented in `CLAUDE.md`'s Docker & Deployment gotcha #37 (scp the script to the Droplet, run it inside a disposable container sharing the already-deployed image, mounting the real data directory — never touch the live `ear-candy` container itself). Dry run first (no `--apply`), confirm it reports exactly the 11 known episode IDs (167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177) with sane non-zero computed durations, then re-run with `--apply`. No `--season-id` filter needed — the affected episodes already span Seasons 1, 2, and 4.

**Acceptance criteria:**
- [ ] Dry run output lists exactly the 11 known-affected episode IDs, each with a plausible computed duration (tens of minutes, consistent with this podcast's typical episode length).
- [ ] `--apply` run completes with `Updated 11 episode(s), skipped 0`.
- [ ] A follow-up read-only query against the production DB confirms `SELECT COUNT(*) FROM episodes WHERE duration_seconds = 0 OR duration_seconds IS NULL` returns `0`.
- [ ] The copied script is deleted from the Droplet afterward (`rm /opt/ear-candy/backfill-durations.mjs`), per the documented procedure's cleanup step.

---

### Step 2: Promote `music-metadata` to a production dependency

**Files:** `server/package.json`, `server/package-lock.json`

**Requires review:** false

Move `"music-metadata": "^11.13.0"` from `devDependencies` to `dependencies` in `server/package.json`. Run `npm install` in `server/` to regenerate `package-lock.json` with the dependency now resolved into the production tree.

**Acceptance criteria:**
- [ ] `music-metadata` appears under `dependencies`, not `devDependencies`, in `server/package.json`.
- [ ] `cd server && npm ci --omit=dev && node -e "require('music-metadata')"` (or the ESM-equivalent dynamic import check) succeeds — confirms it actually resolves under the same install flags the Dockerfile's deps stage uses, not just under a full `npm install`.

---

### Step 3: Add server-side duration detection to the audio upload route

**Files:** `server/src/routes/admin/upload.ts`

**Requires review:** true — architectural change to a production upload endpoint's response contract.

After the existing `pipeline(stream, fs.createWriteStream(dest))` call completes (the file is now fully on disk at `dest`), call `music-metadata`'s `parseFile(dest)` and compute `Math.round(metadata.format.duration)`, mirroring `backfill-durations.mjs`'s exact approach. Wrap this in a `try/catch`: on success, use the rounded value; on any failure (throw, or a `duration` that's missing/non-finite/`<= 0`), use `0` — **never let a duration-parse failure cause the route to return a non-2xx response**, per the decision above.

Add the import: `import { parseFile } from 'music-metadata'`.

Change the final return to:
```ts
let durationSeconds = 0
try {
  const metadata = await parseFile(dest)
  const duration = metadata.format.duration
  if (Number.isFinite(duration) && duration! > 0) {
    durationSeconds = Math.round(duration!)
  }
} catch {
  // Duration detection failing doesn't invalidate the upload — the file
  // already passed magic-byte validation as real audio above. Leave
  // durationSeconds at 0; the admin can see/fix this the same way a
  // failed client-side probe has always surfaced it.
}

return { path: `/audio/${filename}`, duration_seconds: durationSeconds }
```

**Acceptance criteria:**
- [ ] A successful audio upload's response includes a correct `duration_seconds` field (not just `path`).
- [ ] An upload of a file that passes magic-byte validation but isn't parseable by `music-metadata` still returns `200` with `duration_seconds: 0`, not an error response.
- [ ] No change to the existing extension/mimetype/magic-byte validation logic above the pipeline call.

---

### Step 4: Extend server tests for the new upload response shape

**Files:** `server/tests/admin-upload.test.ts`

**Requires review:** false

The existing test file mocks `node:fs`'s `createWriteStream` and `node:stream/promises`'s `pipeline` at the module level, so no real file is ever written to the path `parseFile` would read from — add a module-level mock for `music-metadata` as well (`vi.mock('music-metadata', () => ({ parseFile: vi.fn() }))`), so each test controls what duration detection returns rather than relying on real file I/O.

Add two new test cases (alongside the existing ones in this file, following its established `makeApp()`/`getAuthCookie()`/`REAL_MP3_BYTES` fixture pattern):
1. Mock `parseFile` to resolve `{ format: { duration: 754.6 } }` (an arbitrary realistic value) for a valid upload — assert the response body includes `duration_seconds: 755` (rounded).
2. Mock `parseFile` to reject (`mockRejectedValue(new Error('...'))`) for a valid upload — assert the response is still `200` with `duration_seconds: 0`, confirming a parse failure never blocks the upload.

**Acceptance criteria:**
- [ ] Both new tests pass.
- [ ] All pre-existing tests in this file still pass unmodified in substance (only the added `music-metadata` mock is new setup) — confirms the change is additive, not a behavior change to the existing validation/error paths.

---

### Step 5: Update the client API wrapper's return type

**Files:** `client/src/api.ts`

**Requires review:** false

Change `uploadAudio`'s signature and return-type assertion to include the new field:
```ts
export async function uploadAudio(file: File): Promise<{ path: string; duration_seconds: number }> {
  ...
  return res.json() as Promise<{ path: string; duration_seconds: number }>
}
```

**Acceptance criteria:**
- [ ] `uploadAudio`'s return type includes `duration_seconds: number`.
- [ ] `cd client && npx tsc --noEmit` passes (this step alone will surface a type error at `EpisodeFormPanel.tsx`'s current call site, expected — fixed in Step 6, not here).

---

### Step 6: Use the server-returned duration in `EpisodeFormPanel`, drop the client-side upload-type probe

**Files:** `client/src/pages/admin/EpisodeFormPanel.tsx`

**Requires review:** true — removes an existing client-side code path, not purely additive.

In `handleFileChange` (~line 90-104):
- Delete the `URL.createObjectURL(file)` / `probeAudioDuration(objectUrl)` call and its `setDetectingDuration`/`URL.revokeObjectURL` handling for the upload path entirely.
- Instead, set `durationSeconds` from the `uploadAudio(file)` response once it resolves: `setDurationSeconds(result.duration_seconds)`.
- Keep `setUploading`/`uploadError` handling exactly as-is around the existing `try/catch/finally` for `uploadAudio`.
- It's fine (and simpler) for the duration field to just reflect whatever the upload response says once the upload finishes — there's no longer a separate "detecting" state to manage for the upload-type path specifically, since duration arrives atomically with the upload result. If `detectingDuration`/the loading-state UI is only ever used for the upload-type path (check call sites before removing it — `handleSubmit`'s URL-type path at ~line 148-150 also sets `detectingDuration` for its own probe), **do not remove `detectingDuration` itself** — only stop setting it from the deleted upload-type probe code; the URL-type path's usage must keep working unchanged.

Do not touch `handleSubmit`'s URL-type probing block (~line 138-160) — that logic, including `probeAudioDuration` itself (the function definition stays, since URL-type still uses it), is out of scope per this plan's Context.

**Acceptance criteria:**
- [ ] Selecting a file for an upload-type episode no longer calls `probeAudioDuration`/`URL.createObjectURL` — duration comes solely from the upload response.
- [ ] URL-type episode duration probing (`handleSubmit`'s block) is completely unchanged in behavior.
- [ ] `probeAudioDuration`'s function definition and its doc comment are still present (still used by the URL-type path) — update the doc comment's "Uploaded files: probed immediately via a local object URL" line in `EpisodeFormPanel.tsx` (or wherever the gotcha-style comment lives) to reflect that uploads now get duration from the server, not a local probe, so the comment doesn't describe removed behavior.

---

### Step 7: Update client tests for the new upload-type flow

**Files:** `client/src/tests/EpisodeFormPanel.test.tsx`

**Requires review:** false

Find and update any existing test(s) asserting on the old upload-type local-probe behavior (search for where `vi.stubGlobal('Audio', ...)` or the mocked `FakeAudio` is used in combination with a file-upload test, as opposed to the URL-type submit-time probe tests). Update the mocked `uploadAudio` (or equivalent `vi.mock('../../api', ...)` entry) to resolve `{ path: '...', duration_seconds: <value> }`, and assert the form's duration field reflects that value after upload completes — not via any `Audio`/`FakeAudio` interaction for the upload-type case. Leave URL-type probe tests (using `vi.stubGlobal('Audio', ...)`) untouched, since `handleSubmit`'s URL-type path is unchanged.

**Acceptance criteria:**
- [ ] All `EpisodeFormPanel.test.tsx` tests pass.
- [ ] At least one test explicitly covers: selecting a file for upload → mocked `uploadAudio` resolves with a `duration_seconds` value → the rendered duration reflects it, with no `Audio`/`FakeAudio` construction involved in that specific test.
- [ ] Existing URL-type duration-probe tests (`vi.stubGlobal('Audio', ...)`) are unchanged and still pass.

---

### Step 8: Correct `backfill-durations.mjs`'s stale status note, run full quality gate

**Files:** `server/scripts/backfill-durations.mjs`

**Requires review:** false

The script's header comment currently ends with: *"The underlying client-side timeout bug itself (`EpisodeFormPanel.tsx`'s `probeAudioDuration`, 8s) is NOT fixed by this script — any new large upload-type episode can still hit it; re-run this script per-season as needed until that's addressed separately (detection stays client-side per explicit decision)."* This is now stale once Steps 1-7 ship — correct it in place (matching this repo's established convention of correcting stale status notes rather than deleting history), noting the root cause is now fixed server-side as of this plan, the script remains safe to keep around as a one-off recovery tool for any *future* unrelated cause of `duration_seconds = 0` (e.g., a manually-inserted row, a future format `music-metadata` can't parse), but should no longer be expected to need routine re-running for this specific bug class.

Then run the full quality gate: `make lint`, `make test`, `cd client && npx tsc --noEmit`, `cd client && npm run build`.

**Acceptance criteria:**
- [ ] `backfill-durations.mjs`'s header comment accurately reflects the fixed state, dated, without deleting the prior incident history (2026-07-13/2026-09-08/2026-10 entries all remain, read as a complete timeline).
- [ ] `make lint`, `make test`, `tsc --noEmit`, and the client production build are all green.

## Testing

Step 1 is verified directly against the production database (a `COUNT(*)` query, not an automated test). Steps 3-4 add real server-side coverage via mocked `music-metadata` (success and failure paths) in `server/tests/admin-upload.test.ts` — no real decodable audio fixture is needed server-side since `music-metadata`'s own correctness isn't what's under test, only this route's handling of its result. Steps 5-7 add/update client coverage in `EpisodeFormPanel.test.tsx` confirming the upload-type duration now comes from the mocked API response rather than any `Audio`/`FakeAudio` interaction. No e2e changes are needed — per existing gotcha #31, real browser audio-duration-decoding is already excluded from e2e assertions, and this plan doesn't change e2e-relevant behavior (the upload endpoint's `path` field, which e2e might rely on, is unchanged; only an additional field is added to the response).

## Notes

- **Why synchronous, not a background job:** this codebase has zero job-queue/worker infrastructure today (confirmed during root-cause investigation). Reading a local, already-fully-uploaded file's metadata via `music-metadata` is fast (header/frame inspection, not full-file decode) — there's no latency problem synchronous detection needs to solve around.
- **Why not just raise the client-side timeout instead:** a bigger fixed number is still a fixed number — this podcast's files are already near the current limit, and any larger future file (or a slower admin network connection) would eventually exceed any fixed client-side timeout again. Moving detection server-side removes the timeout dependency entirely rather than postponing the next recurrence.
- **Why URL-type stays client-side:** explicitly scoped out — see Context. Revisit only if a *future* incident actually demonstrates a problem with URL-type duration detection; none exists today.
- **Alternative considered and rejected:** keeping a quick client-side estimate as an instant preview, corrected by the server's value on arrival. Rejected per explicit decision — reintroduces the dual-source-of-truth complexity this plan exists to remove, and a visibly-changing duration number could itself look like a bug to an admin.
