# Episode Audio Upload Feature Plan

## Goal
Allow Ear Candy admins to upload audio files directly when creating or editing an episode, instead of manually typing a file path.

## Current State
- **Server:** Upload endpoint exists (`POST /api/admin/upload`), saves to `data/uploads/`, returns `{ path: "/audio/{uuid}.ext" }`
- **Client:** Episode form has `audio_type` (select: URL/Upload) and `audio_path` (text input) fields. No actual file upload UI.
- **DB:** `episodes` table supports `audio_type: 'upload' | 'url'` and `audio_path` stores the path.

## What Needs to Change

### 1. Client API Layer (`client/src/api.ts`)
Add `uploadAudio(file: File): Promise<{ path: string }>`
- Uses `FormData` with `credentials: 'include'` for auth cookie
- POSTs to `/api/admin/upload`
- Returns the path from the server response

### 2. Episode Form UI (`client/src/pages/admin/EpisodeFormPanel.tsx`)
Replace the manual `audio_path` text input with conditional UI:

**When `audio_type === 'url'`:**
- Keep text input for external URL

**When `audio_type === 'upload'`:**
- Show `<input type="file" accept="audio/*">`
- On file select: upload to server, show progress/spinner
- On success: auto-fill `audio_path` with returned path, set `audio_type` to `'upload'`
- Show filename and "Upload complete" state
- Allow re-upload (replace file)

### 3. Optional: Extract Upload Component
Create `client/src/components/AudioUpload.tsx` for reuse in settings (cover art) or future features.

### 4. Optional: Duration Extraction
Server or client could read audio file metadata to auto-fill `duration_seconds`. This is a nice-to-have, not required.

## Files to Modify

| File | Changes |
|------|---------|
| `client/src/api.ts` | Add `uploadAudio()` function |
| `client/src/pages/admin/EpisodeFormPanel.tsx` | Add file input, upload handling, conditional UI |
| `client/src/pages/admin/EpisodeManager.tsx` | No changes expected (uses EpisodeFormPanel) |
| `server/src/routes/admin/upload.ts` | No changes (already works) |
| `server/src/routes/admin/episodes.ts` | No changes (already accepts audio_type/path) |

## Automated Tests

### Server Tests (`server/tests/`)

| Test File | Test Case |
|-----------|-----------|
| `admin-episodes.test.ts` | Create episode with `audio_type: 'upload'` and verify `audio_path` starts with `/audio/` |
| `admin-episodes.test.ts` | Edit episode to replace upload audio, verify new path persisted |
| `admin-upload.test.ts` | Upload audio file, verify response path format `/audio/{uuid}.ext` |
| `admin-upload.test.ts` | Reject upload without auth cookie (401) |
| `admin-upload.test.ts` | Reject upload without file (400) |

### Client Tests (`client/src/tests/`)

| Test File | Test Case |
|-----------|-----------|
| `api.test.ts` | `uploadAudio` sends `FormData` POST to `/api/admin/upload` with `credentials: 'include'`, returns `{ path }` |
| `api.test.ts` | `uploadAudio` rejects on non-200 response |
| `EpisodeFormPanel.test.tsx` | Shows file input when `audio_type` is "upload" |
| `EpisodeFormPanel.test.tsx` | Shows text input when `audio_type` is "url" |
| `EpisodeFormPanel.test.tsx` | Selecting a file triggers upload, populates `audio_path` on success |
| `EpisodeFormPanel.test.tsx` | Form submission includes correct `audio_type` and `audio_path` after upload |
| `EpisodeFormPanel.test.tsx` | Upload error state is shown to user |

### E2E Tests (`e2e/tests/`)

| Test File | Test Case |
|-----------|-----------|
| `admin.spec.ts` | Create episode with uploaded audio: select file, save, verify episode appears with correct path |
| `admin.spec.ts` | Edit episode to replace uploaded audio: re-upload, save, verify new path |
| `admin.spec.ts` | Uploaded audio plays in listener UI: navigate to episode, click play, verify audio element src |

## Test Data

- **Server:** Use `buildTestApp()` + `getAuthCookie()` helpers. Create mock audio file buffer for upload tests.
- **Client:** Mock `fetch` for `uploadAudio`. Mock `File` object for file input tests.
- **E2E:** Add `e2e/fixtures/test-audio.mp3` (short silent MP3, ~10KB) for Playwright file upload tests.

## Acceptance Criteria
- [ ] Admin can select "Upload" as audio type when creating a new episode
- [ ] Admin can choose an audio file from their computer
- [ ] File uploads to server and appears at `/audio/{uuid}.ext`
- [ ] Episode is created with `audio_type: 'upload'` and correct `audio_path`
- [ ] Uploaded audio plays in the listener audio player
- [ ] Admin can re-upload (replace) audio for an existing episode
- [ ] Works for both create and edit episode flows
- [ ] All server tests pass (`cd server && npm test`)
- [ ] All client tests pass (`cd client && npm test`)
- [ ] All E2E tests pass (`cd e2e && npm test`)

## Out of Scope (Future)
- Drag-and-drop upload
- Upload progress bar
- Audio duration auto-extraction
- Cover art upload (field exists, no UI)
- Bulk episode upload
