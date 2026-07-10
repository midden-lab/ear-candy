# Playwright E2E Test Suite — Design Spec

**Date:** 2026-05-06
**Status:** Approved

---

## 1. Purpose

Add a Playwright end-to-end test suite that exercises the real browser UI against the running dev stack. Tests verify the listener experience, audio player controls, dark/light mode toggle, and admin content management — the features most likely to break silently in a visual SPA.

---

## 2. Architecture

**Root-level `e2e/` package** — isolated from `client/` and `server/`. Playwright is the only dependency. Tests target the Vite dev server at `http://localhost:5173`; the stack must be running (`make up`) before tests execute.

**No automatic stack startup.** The suite is a test runner, not an orchestrator. CI is responsible for `docker compose up -d` before invoking `make e2e`.

**Data strategy — mixed:**
- Listener and player tests: seed data via admin API before each test, delete after. No UI interaction for setup.
- Admin CRUD tests: create/edit/delete via the UI — that is the behaviour under test.

---

## 3. File Layout

```
e2e/
├── package.json           # @playwright/test only
├── playwright.config.ts   # baseURL, chromium, retries, screenshots
├── fixtures.ts            # seededPage + adminPage fixtures
└── tests/
    ├── listener.spec.ts   # sidebar, episode list, detail pane
    ├── player.spec.ts     # AudioPlayer controls
    ├── theme.spec.ts      # dark/light mode toggle
    └── admin.spec.ts      # login, CRUD, settings, logout
```

---

## 4. Playwright Config

```ts
// playwright.config.ts
export default defineConfig({
  testDir: './tests',
  baseURL: 'http://localhost:5173',
  retries: process.env.CI ? 1 : 0,
  use: {
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
```

---

## 5. Fixtures

### `seededPage`

Used by listener and player tests. Before the test:
1. Creates an `APIRequestContext` authenticated with the admin session cookie.
2. Seeds one season and two episodes (with title, number, guests, tags, description, duration, audio URL).
3. Returns a `page` navigated to `/`.

After the test: deletes the season via API (cascades to episodes).

Admin credentials come from `TEST_ADMIN_PASSWORD` env var (defaults to `changeme`).

### `adminPage`

Used by admin tests (except the login tests themselves). Before the test:
1. Calls `POST /api/admin/login` with `TEST_ADMIN_PASSWORD`.
2. Extracts the `admin_session` cookie from the response.
3. Injects the cookie into the browser context.
4. Navigates to `/` and clicks the settings gear to open the admin panel.

Returns a `page` on the admin panel, already authenticated.

---

## 6. Test Suites

### `listener.spec.ts` — uses `seededPage`

| Test | Assertion |
|------|-----------|
| Podcast name in sidebar | `h2` containing the podcast name is visible |
| Season tab renders | Button with season title is visible |
| Episode list fields | Each episode shows `Ep N`, title, duration, guests |
| Episode active state | Clicking an episode adds `border-l-2` to the button, not `bg-[var(--accent)]` |
| Detail pane — season/episode label | Text `Season 1 · Episode 1` is visible |
| Detail pane — guest blue pill | Guest name element has class `bg-blue-900` |
| Detail pane — tag purple pill | Tag element has class `bg-purple-900` |
| Detail pane — About label | Text `About this episode` is visible |

### `player.spec.ts` — uses `seededPage`

| Test | Assertion |
|------|-----------|
| Player hidden on load | AudioPlayer bar not in DOM before episode selected |
| Player appears on episode click | Episode title visible in player bar |
| Play/pause toggle | Clicking Play changes aria-label to "Pause" |
| Speed cycles 1→1.5→2→1 | Speed button text cycles through `1×` `1.5×` `2×` |
| All skip buttons present | Skip to start, Back 15s, Forward 15s, Skip to end buttons visible |
| Timestamps displayed | Elapsed and remaining time elements visible |

### `theme.spec.ts` — no fixture

| Test | Assertion |
|------|-----------|
| Sun badge on load | Button containing ☀️ visible bottom-right |
| Toggle to dark | Clicking adds `dark` class to `<html>`, shows 🌙 |
| Toggle back to light | Clicking again removes `dark` class, shows ☀️ |
| Persists across reload | After toggling dark + reloading, `<html>` still has `dark` class |

### `admin.spec.ts` — bare `page` for login tests; `adminPage` for CRUD

| Test | Assertion |
|------|-----------|
| Wrong password shows error | Error text visible after bad login attempt |
| Correct password navigates to admin | Admin panel heading visible after login |
| Create season | New season heading appears in episode manager |
| Create episode | Episode row appears in season block |
| Edit episode title | Updated title appears in episode list |
| Hide episode | Episode row becomes visually faded |
| Delete episode | Episode row disappears |
| Settings — update podcast name | Save succeeds; no error visible |
| Logout | Listener UI shell is visible after logout |

---

## 7. Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `TEST_ADMIN_PASSWORD` | `changeme` | Password used for API seed auth and admin login tests |
| `BASE_URL` | `http://localhost:5173` | Override if running on a different port |

---

## 8. Makefile Targets

```makefile
e2e:
    cd e2e && npm test

e2e-ui:
    cd e2e && npm run test:ui
```

Both added to the `help` target output.

---

## 9. Out of Scope

- Cross-browser testing (Firefox, Safari/WebKit)
- Mobile viewport tests
- Automatic stack startup from within the test suite
- Visual regression / screenshot diffing
- Audio playback verification (Chromium blocks autoplay without user gesture; tests verify UI state only, not actual audio output)
