import { test, expect } from '../fixtures.js'
import { test as base } from '@playwright/test'

base.describe('Admin login', () => {
  base.test('wrong password shows error message', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Admin' }).click()
    await page.getByLabel('Password').fill('wrongpassword')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toContainText('Invalid password')
  })

  base.test('correct password navigates to admin panel', async ({ page }) => {
    const pw = process.env.TEST_ADMIN_PASSWORD ?? 'changeme'
    await page.goto('/')
    await page.getByRole('button', { name: 'Admin' }).click()
    await page.getByLabel('Password').fill(pw)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Ear Candy Admin')).toBeVisible()
  })
})

test.describe('Admin panel — season management', () => {
  test.afterEach(async ({ adminPage: page }) => {
    const seasons = page.getByTestId('season-card')
    const lastSeason = seasons.last()
    if (await lastSeason.isVisible()) {
      await lastSeason.locator('div').first().getByRole('button', { name: 'Delete' }).click()
    }
  })

  test('create a new season — it appears in episode manager', async ({ adminPage: page }) => {
    const initialCount = await page.getByTestId('season-card').count()
    await page.getByRole('button', { name: '+ New Season' }).click()
    await expect(page.getByTestId('season-card')).toHaveCount(initialCount + 1)
  })

  test('delete a season — it disappears', async ({ adminPage: page }) => {
    const seasons = page.getByTestId('season-card')
    // Record initial count before creating the season to delete
    const initialCount = await seasons.count()
    await page.getByRole('button', { name: '+ New Season' }).click()
    // Wait for the new season to appear
    await expect(seasons).toHaveCount(initialCount + 1)
    const lastSeason = seasons.last()
    // Delete it via the season header's Delete button
    await lastSeason.locator('div').first().getByRole('button', { name: 'Delete' }).click()
    await expect(seasons).toHaveCount(initialCount)
  })
})

test.describe('Admin panel — episode management', () => {
  test.beforeEach(async ({ adminPage: page }) => {
    // Create a season to work with and wait for it to appear in the DOM
    const seasons = page.getByTestId('season-card')
    const countBefore = await seasons.count()
    await page.getByRole('button', { name: '+ New Season' }).click()
    await expect(seasons).toHaveCount(countBefore + 1)
  })

  test.afterEach(async ({ adminPage: page }) => {
    // If a prior assertion failed mid-form (episode create/edit panel still
    // open), it sits on top of the season list and intercepts every click
    // below — close it first so a single failed test can't cascade into
    // every test that runs after it (all sharing this one page/DB).
    const cancelButton = page.getByRole('button', { name: 'Cancel' })
    if (await cancelButton.isVisible().catch(() => false)) {
      await cancelButton.click()
    }

    // Delete the last season (and its episodes via cascade). waitFor (which
    // polls) rather than isVisible().catch() (an instant, non-retrying
    // check) — found via real debugging that a test which does a hard
    // page.goto()/reload right before this hook runs (the cover-art test,
    // which reloads to verify the image on the public listener page) can
    // still have its season-list fetch in flight at this exact moment;
    // isVisible() would then return false immediately and skip the delete
    // entirely, leaking the season into every subsequent test in the file
    // (exactly CLAUDE.md gotcha #30's cascading-failure class, just from a
    // fetch race instead of a stuck form panel).
    const seasons = page.getByTestId('season-card')
    const lastSeason = seasons.last()
    const appeared = await lastSeason.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)
    if (appeared) {
      // The season header is the first child div (bg-zinc-900) containing Edit/Delete
      await lastSeason.locator('div').first().getByRole('button', { name: 'Delete' }).click()
    }
  })

  test('create an episode — it appears in the season block', async ({ adminPage: page }) => {
    const lastSeason = page.getByTestId('season-card').last()
    await lastSeason.getByRole('button', { name: 'New Episode' }).click()
    // Fill in the episode form panel
    await page.getByLabel('Title').fill('My Test Episode')
    await page.getByLabel('Episode #').fill('1')
    await page.getByLabel('Publish Date').fill('2024-06-01')
    await page.getByLabel('Audio URL').fill('https://example.com/test.mp3')
    await page.getByRole('button', { name: 'Save' }).click()
    // Episode appears in season block
    await expect(lastSeason.getByText('My Test Episode')).toBeVisible()
  })

  test('create an episode with uploaded audio — it appears in the season block', async ({ adminPage: page }) => {
    const lastSeason = page.getByTestId('season-card').last()
    await lastSeason.getByRole('button', { name: 'New Episode' }).click()
    // Fill in the episode form panel with upload
    await page.getByLabel('Title').fill('Uploaded Episode')
    await page.getByLabel('Episode #').fill('2')
    await page.getByLabel('Publish Date').fill('2024-06-02')
    await page.getByLabel('Audio Type').selectOption('upload')
    await page.getByLabel('Audio File').setInputFiles('fixtures/test-audio.mp3')
    await expect(page.getByText(/uploaded:/i)).toBeVisible()
    await page.getByRole('button', { name: 'Save' }).click()
    // Episode appears in season block
    await expect(lastSeason.getByText('Uploaded Episode')).toBeVisible()
  })

  // Duration auto-detection itself (probing, Infinity/durationchange
  // fallback, failure handling) is covered by 19 unit tests in
  // EpisodeFormPanel.test.tsx with a controllable fake Audio — real browser
  // audio decoding turned out to be unreliable specifically in GitHub
  // Actions' headless Chromium (missing audio backend on the minimal runner
  // image), so an e2e assertion on the exact detected duration flaked there
  // every time despite passing reliably on every local run. Not worth an
  // e2e test given the logic is already solidly covered elsewhere.

  test('create an episode with cover art — full image shows in the detail pane (list rows never show cover art, matching the mockup, plans/010)', async ({ adminPage: page }) => {
    const lastSeason = page.getByTestId('season-card').last()
    await lastSeason.getByRole('button', { name: 'New Episode' }).click()
    await page.getByLabel('Title').fill('Episode With Art')
    await page.getByLabel('Episode #').fill('3')
    await page.getByLabel('Publish Date').fill('2024-06-03')
    await page.getByLabel('Audio Type').selectOption('url')
    await page.getByLabel('Audio URL').fill('https://example.com/ep3.mp3')
    await page.getByLabel(/cover art/i).setInputFiles('fixtures/test-cover.jpg')
    await expect(page.getByAltText('Cover art preview')).toBeVisible()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(lastSeason.getByText('Episode With Art')).toBeVisible()

    // Switch to the public listener view to verify the art actually renders there.
    await page.goto('/')
    const item = page.locator('button.row', { hasText: 'Episode With Art' })
    await expect(item).toBeVisible()
    // List rows never show cover art (matching the mockup exactly) — the
    // uploaded image only ever appears in the detail pane's hero .art.
    await expect(item.locator('img')).toHaveCount(0)

    await item.click()
    const detailImg = page.locator('main img').first()
    await expect(detailImg).toHaveAttribute('srcset', /-detail\.webp/)

    // Return to the admin panel so the shared afterEach can find and clean
    // up the season/episode created above.
    await page.getByRole('button', { name: 'Admin' }).click()
    await expect(page.getByText('Ear Candy Admin')).toBeVisible()
  })

  test('edit an episode title — change is reflected in the list', async ({ adminPage: page }) => {
    // Create an episode first
    const lastSeason = page.getByTestId('season-card').last()
    await lastSeason.getByRole('button', { name: 'New Episode' }).click()
    await page.getByLabel('Title').fill('Original Title')
    await page.getByLabel('Episode #').fill('1')
    await page.getByLabel('Publish Date').fill('2024-06-01')
    await page.getByLabel('Audio URL').fill('https://example.com/test.mp3')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(lastSeason.getByText('Original Title')).toBeVisible()
    // Edit it — scope to the episode row to avoid matching the season header's Edit button
    const epRow = lastSeason.locator('div', { hasText: 'Original Title' }).filter({ has: page.getByRole('button', { name: 'Edit' }) })
    await epRow.getByRole('button', { name: 'Edit' }).click()
    await page.getByLabel('Title').clear()
    await page.getByLabel('Title').fill('Updated Title')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(lastSeason.getByText('Updated Title')).toBeVisible()
    await expect(lastSeason.getByText('Original Title')).not.toBeVisible()
  })

  test('delete an episode — it disappears from the list', async ({ adminPage: page }) => {
    // Create an episode first
    const lastSeason = page.getByTestId('season-card').last()
    await lastSeason.getByRole('button', { name: 'New Episode' }).click()
    await page.getByLabel('Title').fill('Episode To Delete')
    await page.getByLabel('Episode #').fill('1')
    await page.getByLabel('Publish Date').fill('2024-06-01')
    await page.getByLabel('Audio URL').fill('https://example.com/test.mp3')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(lastSeason.getByText('Episode To Delete')).toBeVisible()
    // Delete it
    const epRow = lastSeason.locator('div', { hasText: 'Episode To Delete' }).filter({ has: page.getByRole('button', { name: 'Delete' }) })
    await epRow.getByRole('button', { name: 'Delete' }).click()
    await expect(lastSeason.getByText('Episode To Delete')).not.toBeVisible()
  })
})

test.describe('Admin panel — settings', () => {
  test.afterEach(async ({ adminPage: page }) => {
    await page.request.patch('/api/admin/settings', {
      data: { podcast_name: 'My Podcast', favicon_path: null },
    })
  })

  test('update podcast name — save succeeds', async ({ adminPage: page }) => {
    // Navigate to Settings tab
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    // Update podcast name
    await page.getByLabel('Podcast Name').clear()
    await page.getByLabel('Podcast Name').fill('My E2E Podcast')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toContainText('Settings saved!')
  })

  test('upload a favicon — preview shows, saves, and the browser tab icon updates', async ({ adminPage: page }) => {
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    await page.getByLabel('Favicon').setInputFiles('fixtures/test-favicon.png')
    await expect(page.getByAltText('Favicon preview')).toBeVisible()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toContainText('Settings saved!')

    // Reload the public listener view and confirm the injected <link rel="icon">
    // actually points at the uploaded favicon.
    await page.goto('/')
    const iconHref = await page.locator('link[rel="icon"]').getAttribute('href')
    expect(iconHref).toMatch(/^\/images\/favicon-.*\.png$/)
  })
})

test.describe('Admin panel — logout', () => {
  test('Sign out returns to the listener UI', async ({ adminPage: page }) => {
    await page.getByRole('button', { name: 'Sign out' }).click()
    // Listener shell is visible again (masthead's Admin control + <main>)
    await expect(page.getByRole('button', { name: 'Admin' })).toBeVisible()
    await expect(page.locator('main').first()).toBeVisible()
    // Admin header is gone
    await expect(page.getByText('Ear Candy Admin')).not.toBeVisible()
  })

  // Regression test: "Sign out" must invalidate the server-side session, not
  // just reset client-side view state — otherwise the still-valid session
  // cookie lets a later click on the admin icon bypass the password prompt.
  base.test('signing out and reopening admin prompts for the password again', async ({ page }) => {
    const pw = process.env.TEST_ADMIN_PASSWORD ?? 'changeme'
    await page.goto('/')
    await page.getByRole('button', { name: 'Admin' }).click()
    await page.getByLabel('Password').fill(pw)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Ear Candy Admin')).toBeVisible()

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByText('Ear Candy Admin')).not.toBeVisible()

    await page.getByRole('button', { name: 'Admin' }).click()
    await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible()
    await expect(page.getByText('Ear Candy Admin')).not.toBeVisible()
  })
})
