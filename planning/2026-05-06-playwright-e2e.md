# Playwright E2E Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a root-level `e2e/` Playwright test suite that exercises the listener UI, audio player, dark/light toggle, and admin CRUD flows against the running dev stack.

**Architecture:** Root-level `e2e/` package with `@playwright/test` only. Flat fixture-based: a `seededPage` fixture seeds known data via the admin API before listener/player tests; an `adminPage` fixture authenticates the browser via `page.request` before admin tests. All tests target `http://localhost:5173` (Vite dev server with `/api` proxy to the Fastify server). Tests assume `make up` is running.

**Tech Stack:** `@playwright/test` 1.44+, Chromium only, TypeScript

---

## File Map

### Created
- `e2e/package.json` — Playwright dependency, test/test:ui scripts
- `e2e/playwright.config.ts` — baseURL, chromium project, retries, screenshot on failure
- `e2e/.gitignore` — exclude test-results/ and playwright-report/
- `e2e/fixtures.ts` — `seededPage` and `adminPage` custom fixtures, re-exports `expect`
- `e2e/tests/listener.spec.ts` — sidebar, episode list, detail pane tests
- `e2e/tests/player.spec.ts` — AudioPlayer control tests
- `e2e/tests/theme.spec.ts` — dark/light toggle tests
- `e2e/tests/admin.spec.ts` — login, season/episode CRUD, settings, logout

### Modified
- `Makefile` — add `e2e` and `e2e-ui` targets, update `help` text

---

## Task 1: Scaffold the e2e package

**Files:**
- Create: `e2e/package.json`
- Create: `e2e/playwright.config.ts`
- Create: `e2e/.gitignore`

- [ ] **Step 1: Create `e2e/package.json`**

```json
{
  "name": "ear-candy-e2e",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "playwright test",
    "test:ui": "playwright test --ui"
  },
  "devDependencies": {
    "@playwright/test": "^1.44.0"
  }
}
```

- [ ] **Step 2: Create `e2e/playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
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

- [ ] **Step 3: Create `e2e/.gitignore`**

```
node_modules/
test-results/
playwright-report/
```

- [ ] **Step 4: Install dependencies and browsers**

```bash
cd /path/to/ear_candy/e2e && npm install && npx playwright install chromium
```

Expected: `node_modules/` created, chromium browser downloaded. Last line contains `chromium` and `ready`.

- [ ] **Step 5: Verify Playwright CLI works**

```bash
cd /path/to/ear_candy/e2e && npx playwright --version
```

Expected: prints `Version 1.44.x` or higher.

- [ ] **Step 6: Commit**

```bash
cd /path/to/ear_candy && git add e2e/package.json e2e/playwright.config.ts e2e/.gitignore e2e/package-lock.json && git commit -m "feat: scaffold e2e Playwright package"
```

---

## Task 2: Fixtures — seededPage and adminPage

**Files:**
- Create: `e2e/fixtures.ts`

The `seededPage` fixture authenticates an isolated API request context, seeds known settings + one season + two episodes, navigates the page to `/`, yields the page, then deletes the season (cascading episodes) and restores settings on teardown.

The `adminPage` fixture authenticates the browser by calling `POST /api/admin/login` through `page.request` (which shares the browser's cookie jar), navigates to `/`, clicks the gear icon, and waits for the admin panel header.

- [ ] **Step 1: Create `e2e/fixtures.ts`**

```ts
import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'changeme'

type Fixtures = {
  seededPage: Page
  adminPage: Page
}

export const test = base.extend<Fixtures>({
  seededPage: async ({ page, request }, use) => {
    // Authenticate the isolated API request context
    await request.post('/api/admin/login', {
      data: { password: PASSWORD },
    })

    // Seed known settings so listener tests see predictable podcast name
    await request.patch('/api/admin/settings', {
      data: { podcast_name: 'Test Podcast' },
    })

    // Create one season
    const seasonRes = await request.post('/api/admin/seasons', {
      data: { number: 1, title: 'Season 1' },
    })
    const season = await seasonRes.json() as { id: number }

    // Create two episodes
    await request.post('/api/admin/episodes', {
      data: {
        season_id: season.id,
        number: 1,
        title: 'Deep Dive',
        guests: 'Alice Chen',
        tags: 'interview, tech',
        description: 'A deep dive into software engineering.',
        duration_seconds: 1800,
        publish_date: '2024-01-15',
        audio_type: 'url',
        audio_path: 'https://example.com/ep1.mp3',
      },
    })
    await request.post('/api/admin/episodes', {
      data: {
        season_id: season.id,
        number: 2,
        title: 'Panel Discussion',
        guests: 'Bob Smith',
        tags: 'panel',
        description: 'A roundtable on software development.',
        duration_seconds: 3600,
        publish_date: '2024-02-01',
        audio_type: 'url',
        audio_path: 'https://example.com/ep2.mp3',
      },
    })

    await page.goto('/')
    await use(page)

    // Teardown: delete season (cascades to episodes)
    await request.delete(`/api/admin/seasons/${season.id}`)
    // Restore podcast name
    await request.patch('/api/admin/settings', {
      data: { podcast_name: 'My Podcast' },
    })
  },

  adminPage: async ({ page }, use) => {
    // Authenticate the browser context (page.request shares the browser's cookie jar)
    await page.request.post('/api/admin/login', {
      data: { password: PASSWORD },
    })
    await page.goto('/')
    // Open admin panel via the settings gear icon
    await page.getByRole('button', { name: 'Admin settings' }).click()
    await page.waitForSelector('text=Ear Candy Admin')
    await use(page)
  },
})

export { expect }
```

- [ ] **Step 2: Verify fixtures file has no TypeScript errors**

```bash
cd /path/to/ear_candy/e2e && npx tsc --noEmit --strict fixtures.ts 2>&1 || true
```

Expected: no output, or only minor type-only warnings (not errors). If there are errors, fix them before continuing.

- [ ] **Step 3: Commit**

```bash
cd /path/to/ear_candy && git add e2e/fixtures.ts && git commit -m "feat: add seededPage and adminPage Playwright fixtures"
```

---

## Task 3: listener.spec.ts — sidebar, episode list, detail pane

**Files:**
- Create: `e2e/tests/listener.spec.ts`

Prerequisite: `make up` must be running with a valid `.env`.

- [ ] **Step 1: Create `e2e/tests/listener.spec.ts`**

```ts
import { test, expect } from '../fixtures.js'

test.describe('Listener UI', () => {
  test('shows podcast name in sidebar header', async ({ seededPage: page }) => {
    await expect(page.getByRole('heading', { name: 'Test Podcast' })).toBeVisible()
  })

  test('shows season tab', async ({ seededPage: page }) => {
    await expect(page.getByRole('button', { name: 'Season 1' })).toBeVisible()
  })

  test('episode list shows number, title, duration, guests', async ({ seededPage: page }) => {
    const item = page.locator('button', { hasText: 'Deep Dive' })
    await expect(item).toBeVisible()
    await expect(item).toContainText('Ep 1')
    await expect(item).toContainText('30:00')        // 1800s
    await expect(item).toContainText('Alice Chen')
  })

  test('clicking an episode gives it a left accent border, not a solid fill', async ({ seededPage: page }) => {
    const item = page.locator('button', { hasText: 'Deep Dive' })
    await item.click()
    await expect(item).toHaveAttribute('aria-current', 'true')
    await expect(item).toHaveClass(/border-l-2/)
    await expect(item).not.toHaveClass(/bg-\[var\(--accent\)\]/)
  })

  test('detail pane shows season/episode label', async ({ seededPage: page }) => {
    await page.locator('button', { hasText: 'Deep Dive' }).click()
    await expect(page.getByText('Season 1 · Episode 1')).toBeVisible()
  })

  test('detail pane shows guest as blue pill', async ({ seededPage: page }) => {
    await page.locator('button', { hasText: 'Deep Dive' }).click()
    const pill = page.getByText('Alice Chen')
    await expect(pill).toBeVisible()
    await expect(pill).toHaveClass(/bg-blue-900/)
  })

  test('detail pane shows tag as purple pill', async ({ seededPage: page }) => {
    await page.locator('button', { hasText: 'Deep Dive' }).click()
    const pill = page.getByText('interview')
    await expect(pill).toBeVisible()
    await expect(pill).toHaveClass(/bg-purple-900/)
  })

  test('detail pane shows About this episode label', async ({ seededPage: page }) => {
    await page.locator('button', { hasText: 'Deep Dive' }).click()
    await expect(page.getByText('About this episode')).toBeVisible()
    await expect(page.getByText('A deep dive into software engineering.')).toBeVisible()
  })
})
```

- [ ] **Step 2: Run the listener tests (stack must be running)**

```bash
cd /path/to/ear_candy/e2e && npx playwright test tests/listener.spec.ts --reporter=line
```

Expected: 8 tests pass. If any fail, check that the dev stack is running (`make up`) and the `.env` has a valid `ADMIN_PASSWORD_HASH`.

- [ ] **Step 3: Commit**

```bash
cd /path/to/ear_candy && git add e2e/tests/listener.spec.ts && git commit -m "feat: add listener UI Playwright tests"
```

---

## Task 4: player.spec.ts — AudioPlayer controls

**Files:**
- Create: `e2e/tests/player.spec.ts`

Note: Chromium blocks `HTMLMediaElement.play()` without a prior user gesture. Tests verify the player UI state only — they don't assert that audio actually plays.

- [ ] **Step 1: Create `e2e/tests/player.spec.ts`**

```ts
import { test, expect } from '../fixtures.js'

test.describe('Audio Player', () => {
  test('player bar is hidden before an episode is selected', async ({ seededPage: page }) => {
    // The player is only rendered when episode != null
    await expect(page.getByRole('button', { name: 'Play' })).not.toBeVisible()
  })

  test('player bar appears with episode title after clicking an episode', async ({ seededPage: page }) => {
    await page.locator('button', { hasText: 'Deep Dive' }).click()
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()
    // Episode title shown in player bar
    const playerBar = page.locator('.fixed.bottom-0')
    await expect(playerBar).toContainText('Deep Dive')
  })

  test('Play button aria-label becomes Pause after clicking', async ({ seededPage: page }) => {
    await page.locator('button', { hasText: 'Deep Dive' }).click()
    const playBtn = page.getByRole('button', { name: 'Play' })
    await playBtn.click()
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  })

  test('speed toggle cycles 1× → 1.5× → 2× → 1×', async ({ seededPage: page }) => {
    await page.locator('button', { hasText: 'Deep Dive' }).click()
    const speedBtn = page.getByRole('button', { name: /speed/i })
    await expect(speedBtn).toHaveText('1×')
    await speedBtn.click()
    await expect(speedBtn).toHaveText('1.5×')
    await speedBtn.click()
    await expect(speedBtn).toHaveText('2×')
    await speedBtn.click()
    await expect(speedBtn).toHaveText('1×')
  })

  test('all skip and seek buttons are visible', async ({ seededPage: page }) => {
    await page.locator('button', { hasText: 'Deep Dive' }).click()
    await expect(page.getByRole('button', { name: 'Skip to start' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Back 15 seconds' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Forward 15 seconds' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip to end' })).toBeVisible()
  })

  test('elapsed and remaining timestamps are visible', async ({ seededPage: page }) => {
    await page.locator('button', { hasText: 'Deep Dive' }).click()
    // At load the current time is 0:00 and remaining is -30:00 (1800s)
    const playerBar = page.locator('.fixed.bottom-0')
    await expect(playerBar.getByText('0:00').first()).toBeVisible()
    await expect(playerBar.getByText(/-\d+:\d{2}/)).toBeVisible()
  })
})
```

- [ ] **Step 2: Run the player tests**

```bash
cd /path/to/ear_candy/e2e && npx playwright test tests/player.spec.ts --reporter=line
```

Expected: 6 tests pass.

- [ ] **Step 3: Commit**

```bash
cd /path/to/ear_candy && git add e2e/tests/player.spec.ts && git commit -m "feat: add AudioPlayer Playwright tests"
```

---

## Task 5: theme.spec.ts — dark/light mode toggle

**Files:**
- Create: `e2e/tests/theme.spec.ts`

These tests use the bare `page` fixture (no seeding needed — the ThemeBadge works independently of data).

- [ ] **Step 1: Create `e2e/tests/theme.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test.describe('Dark/light mode toggle', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage so each test starts from a clean light-mode state
    await page.goto('/')
    await page.evaluate(() => localStorage.removeItem('theme'))
    await page.evaluate(() => document.documentElement.classList.remove('dark'))
    await page.reload()
  })

  test('sun badge is visible in the bottom-right corner on load', async ({ page }) => {
    await page.goto('/')
    const badge = page.getByRole('button', { name: /toggle dark mode/i })
    await expect(badge).toBeVisible()
    await expect(badge).toContainText('☀️')
  })

  test('clicking the badge adds dark class to <html> and shows moon', async ({ page }) => {
    await page.goto('/')
    const badge = page.getByRole('button', { name: /toggle dark mode/i })
    await badge.click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.getByRole('button', { name: /toggle light mode/i })).toContainText('🌙')
  })

  test('clicking again removes dark class and shows sun', async ({ page }) => {
    await page.goto('/')
    const badge = page.getByRole('button', { name: /toggle dark mode/i })
    await badge.click()  // → dark
    await page.getByRole('button', { name: /toggle light mode/i }).click()  // → light
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    await expect(page.getByRole('button', { name: /toggle dark mode/i })).toContainText('☀️')
  })

  test('dark mode preference persists across page reload', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /toggle dark mode/i }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/dark/)
  })
})
```

- [ ] **Step 2: Run the theme tests**

```bash
cd /path/to/ear_candy/e2e && npx playwright test tests/theme.spec.ts --reporter=line
```

Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
cd /path/to/ear_candy && git add e2e/tests/theme.spec.ts && git commit -m "feat: add dark/light mode Playwright tests"
```

---

## Task 6: admin.spec.ts — login, CRUD, settings, logout

**Files:**
- Create: `e2e/tests/admin.spec.ts`

Login tests use bare `page`. All other tests use `adminPage`. Each CRUD test creates data via the UI and deletes it via the UI in `afterEach` — no API teardown needed.

- [ ] **Step 1: Create `e2e/tests/admin.spec.ts`**

```ts
import { test, expect } from '../fixtures.js'
import { test as base } from '@playwright/test'

base.describe('Admin login', () => {
  base.test('wrong password shows error message', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Admin settings' }).click()
    await page.getByLabel('Password').fill('wrongpassword')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toContainText('Invalid password')
  })

  base.test('correct password navigates to admin panel', async ({ page }) => {
    const pw = process.env.TEST_ADMIN_PASSWORD ?? 'changeme'
    await page.goto('/')
    await page.getByRole('button', { name: 'Admin settings' }).click()
    await page.getByLabel('Password').fill(pw)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Ear Candy Admin')).toBeVisible()
  })
})

test.describe('Admin panel — season management', () => {
  test('create a new season — it appears in episode manager', async ({ adminPage: page }) => {
    const initialCount = await page.locator('[class*="rounded-xl border"]').count()
    await page.getByRole('button', { name: '+ New Season' }).click()
    await expect(page.locator('[class*="rounded-xl border"]')).toHaveCount(initialCount + 1)
  })

  test('delete a season — it disappears', async ({ adminPage: page }) => {
    // Create a season to delete
    await page.getByRole('button', { name: '+ New Season' }).click()
    const seasons = page.locator('[class*="rounded-xl border"]')
    const lastSeason = seasons.last()
    await expect(lastSeason).toBeVisible()
    const countBefore = await seasons.count()
    // Delete it
    await lastSeason.getByRole('button', { name: 'Delete' }).click()
    await expect(seasons).toHaveCount(countBefore - 1)
  })
})

test.describe('Admin panel — episode management', () => {
  let seasonBlock: ReturnType<typeof test.extend>

  test.beforeEach(async ({ adminPage: page }) => {
    // Create a season to work with
    await page.getByRole('button', { name: '+ New Season' }).click()
  })

  test.afterEach(async ({ adminPage: page }) => {
    // Delete the last season (and its episodes via cascade)
    const seasons = page.locator('[class*="rounded-xl border"]')
    const lastSeason = seasons.last()
    if (await lastSeason.isVisible()) {
      await lastSeason.getByRole('button', { name: 'Delete' }).click()
    }
  })

  test('create an episode — it appears in the season block', async ({ adminPage: page }) => {
    const lastSeason = page.locator('[class*="rounded-xl border"]').last()
    await lastSeason.getByRole('button', { name: '+ New Episode' }).click()
    // Fill in the episode form panel
    await page.getByLabel('Title').fill('My Test Episode')
    await page.getByLabel('Episode #').fill('1')
    await page.getByLabel('Publish Date').fill('2024-06-01')
    await page.getByLabel('Audio Path/URL').fill('https://example.com/test.mp3')
    await page.getByRole('button', { name: 'Save' }).click()
    // Episode appears in season block
    await expect(lastSeason.getByText('My Test Episode')).toBeVisible()
  })

  test('edit an episode title — change is reflected in the list', async ({ adminPage: page }) => {
    // Create an episode first
    const lastSeason = page.locator('[class*="rounded-xl border"]').last()
    await lastSeason.getByRole('button', { name: '+ New Episode' }).click()
    await page.getByLabel('Title').fill('Original Title')
    await page.getByLabel('Episode #').fill('1')
    await page.getByLabel('Publish Date').fill('2024-06-01')
    await page.getByLabel('Audio Path/URL').fill('https://example.com/test.mp3')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(lastSeason.getByText('Original Title')).toBeVisible()
    // Edit it
    await lastSeason.getByRole('button', { name: 'Edit' }).click()
    await page.getByLabel('Title').clear()
    await page.getByLabel('Title').fill('Updated Title')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(lastSeason.getByText('Updated Title')).toBeVisible()
    await expect(lastSeason.getByText('Original Title')).not.toBeVisible()
  })

  test('delete an episode — it disappears from the list', async ({ adminPage: page }) => {
    // Create an episode first
    const lastSeason = page.locator('[class*="rounded-xl border"]').last()
    await lastSeason.getByRole('button', { name: '+ New Episode' }).click()
    await page.getByLabel('Title').fill('Episode To Delete')
    await page.getByLabel('Episode #').fill('1')
    await page.getByLabel('Publish Date').fill('2024-06-01')
    await page.getByLabel('Audio Path/URL').fill('https://example.com/test.mp3')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(lastSeason.getByText('Episode To Delete')).toBeVisible()
    // Delete it
    const epRow = lastSeason.locator('div', { hasText: 'Episode To Delete' })
    await epRow.getByRole('button', { name: 'Delete' }).click()
    await expect(lastSeason.getByText('Episode To Delete')).not.toBeVisible()
  })
})

test.describe('Admin panel — settings', () => {
  test('update podcast name — save succeeds', async ({ adminPage: page }) => {
    // Navigate to Settings tab
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    // Update podcast name
    await page.getByLabel('Podcast Name').clear()
    await page.getByLabel('Podcast Name').fill('My E2E Podcast')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toContainText('Settings saved!')
    // Restore original name
    await page.getByLabel('Podcast Name').clear()
    await page.getByLabel('Podcast Name').fill('My Podcast')
    await page.getByRole('button', { name: 'Save' }).click()
  })
})

test.describe('Admin panel — logout', () => {
  test('Sign out returns to the listener UI', async ({ adminPage: page }) => {
    await page.getByRole('button', { name: 'Sign out' }).click()
    // Listener shell is visible (AppShell has a <nav> and a <main>)
    await expect(page.locator('nav').first()).toBeVisible()
    await expect(page.locator('main').first()).toBeVisible()
    // Admin header is gone
    await expect(page.getByText('Ear Candy Admin')).not.toBeVisible()
  })
})
```

- [ ] **Step 2: Run the admin tests**

```bash
cd /path/to/ear_candy/e2e && npx playwright test tests/admin.spec.ts --reporter=line
```

Expected: all tests pass. If the episode form tests fail, check that the form panel labels match `getByLabel()` — the form uses `<label htmlFor="ep-title">Title</label>` which Playwright matches via the associated `<input id="ep-title">`.

- [ ] **Step 3: Commit**

```bash
cd /path/to/ear_candy && git add e2e/tests/admin.spec.ts && git commit -m "feat: add admin panel Playwright tests"
```

---

## Task 7: Makefile — add e2e targets and update help

**Files:**
- Modify: `Makefile`

- [ ] **Step 1: Read the current Makefile**

Read `/path/to/ear_candy/Makefile` to see the current `.PHONY` line and `help` target.

- [ ] **Step 2: Add e2e targets**

Update the `.PHONY` line to include `e2e` and `e2e-ui`.

Add these two targets after the `lint` target:

```makefile
e2e:
	cd e2e && npm test

e2e-ui:
	cd e2e && npm run test:ui
```

Update the `help` target to include the new targets:

```
@echo "  e2e              Run Playwright E2E tests (requires: make up)"
@echo "  e2e-ui           Open Playwright UI mode"
```

- [ ] **Step 3: Verify make help shows the new targets**

```bash
cd /path/to/ear_candy && make help
```

Expected: output includes `e2e` and `e2e-ui` lines.

- [ ] **Step 4: Run the full suite via Make to confirm wiring**

```bash
cd /path/to/ear_candy && make e2e
```

Expected: Playwright runs all 4 spec files, all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /path/to/ear_candy && git add Makefile && git commit -m "feat: add e2e and e2e-ui Makefile targets"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Root-level `e2e/` package, `@playwright/test` only | Task 1 |
| `playwright.config.ts` — baseURL, chromium, retries, screenshots | Task 1 |
| `seededPage` fixture — API seed + teardown | Task 2 |
| `adminPage` fixture — browser auth via `page.request` | Task 2 |
| Podcast name in sidebar | Task 3 |
| Season tab | Task 3 |
| Episode number, title, duration, guests | Task 3 |
| Episode active state: `border-l-2`, not `bg-[var(--accent)]` | Task 3 |
| Detail pane: season/episode label | Task 3 |
| Detail pane: blue guest pill | Task 3 |
| Detail pane: purple tag pill | Task 3 |
| "About this episode" label | Task 3 |
| Player hidden before selection | Task 4 |
| Player appears with title after click | Task 4 |
| Play/pause toggle | Task 4 |
| Speed cycles 1×→1.5×→2×→1× | Task 4 |
| All skip buttons present | Task 4 |
| Timestamps visible | Task 4 |
| Sun badge visible on load | Task 5 |
| Toggle to dark adds `dark` class | Task 5 |
| Toggle back removes `dark` class | Task 5 |
| Persists across reload | Task 5 |
| Wrong password error | Task 6 |
| Correct password → admin panel | Task 6 |
| Create season | Task 6 |
| Delete season | Task 6 |
| Create episode | Task 6 |
| Edit episode title | Task 6 |
| Delete episode | Task 6 |
| Update podcast name → save success | Task 6 |
| Logout → listener UI | Task 6 |
| Makefile `e2e` and `e2e-ui` targets | Task 7 |

**Placeholder scan:** No TBDs, no "add appropriate" phrases. Every test has a concrete selector and assertion.

**Type consistency:** `seededPage` and `adminPage` are both typed as `Page` throughout. The `season` object typed as `{ id: number }` from the JSON response. Import of `base` in admin.spec.ts aliased clearly to avoid confusion with the custom `test`.

**Note on `admin.spec.ts` imports:** The file imports both `test` (from `../fixtures.js`) and `test as base` (from `@playwright/test`). The login tests use `base` because they don't need the `adminPage` fixture. The CRUD tests use `test` from fixtures. This is intentional — login tests must use a clean unauthenticated browser.
