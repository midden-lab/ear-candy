import { test, expect } from '../fixtures.js'

// EpisodeItem's accessible name is "Ep {number} {title} {date} ...". Anchoring
// on this (rather than a generic hasText match) uniquely identifies the list
// item regardless of whether it's rendered inside <aside> (desktop) or
// <main> (mobile list pane) — and regardless of the mini-player, whose own
// button also visibly contains the episode title as text.
const deepDiveItem = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: /^Ep \d+ Deep Dive/ })
const panelDiscussionItem = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: /^Ep \d+ Panel Discussion/ })

test.describe('Mobile listener UI (< md)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('episode list is full-width and visible on load; detail pane is not shown', async ({ seededPage: page }) => {
    await expect(page.getByRole('heading', { name: 'Test Podcast' })).toBeVisible()
    await expect(deepDiveItem(page)).toBeVisible()
    await expect(page.getByText('Select an episode to begin')).not.toBeVisible()
  })

  test('tapping an episode shows the detail pane full-width; list is hidden', async ({ seededPage: page }) => {
    await deepDiveItem(page).click()
    await expect(page.getByText('Season 1 · Episode 1')).toBeVisible()
    await expect(panelDiscussionItem(page)).not.toBeVisible()
  })

  test('focus lands on the main content region after navigating to detail', async ({ seededPage: page }) => {
    await deepDiveItem(page).click()
    await expect(page.getByText('Season 1 · Episode 1')).toBeVisible()
    await expect(page.locator('main')).toBeFocused()
  })

  test('back button returns to the episode list', async ({ seededPage: page }) => {
    await deepDiveItem(page).click()
    await expect(page.getByText('Season 1 · Episode 1')).toBeVisible()
    await page.getByRole('button', { name: /back to episodes/i }).click()
    await expect(deepDiveItem(page)).toBeVisible()
    await expect(panelDiscussionItem(page)).toBeVisible()
  })

  test('player mini-bar is visible after pressing Play and docks above the bottom tab bar, not overlapping it', async ({ seededPage: page }) => {
    await deepDiveItem(page).click()
    await page.getByRole('button', { name: 'Play' }).click()
    const miniBar = page.getByTestId('player-bar')
    await expect(miniBar).toBeVisible()
    await expect(miniBar).toContainText('Deep Dive')

    // Back to the list, where the persistent bottom tab bar is shown, and
    // confirm the mini-bar (still playing) docks above it without overlap.
    await page.getByRole('button', { name: /back to episodes/i }).click()
    const tabBarEpisodes = page.getByRole('button', { name: 'Episodes', exact: true })
    await expect(tabBarEpisodes).toBeVisible()
    const barBox = await miniBar.boundingBox()
    const tabBarBox = await tabBarEpisodes.boundingBox()
    expect(barBox).not.toBeNull()
    expect(tabBarBox).not.toBeNull()
    if (barBox && tabBarBox) {
      expect(barBox.y + barBox.height).toBeLessThanOrEqual(tabBarBox.y)
    }
  })

  test('tapping the mini-bar opens the full-screen now-playing overlay with all controls tappable', async ({ seededPage: page }) => {
    await deepDiveItem(page).click()
    // Pressing the detail pane's Play button starts playback immediately, so
    // the transport button already reads "Pause" by the time the overlay opens.
    await page.getByRole('button', { name: 'Play' }).click()
    await page.getByRole('button', { name: /now playing/i }).click()

    await expect(page.getByRole('button', { name: 'Collapse now playing' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip to start' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Back 15 seconds' })).toBeVisible()
    // Also accepts "Retry playback": the seeded episode's stub audio URL is
    // a real network resource a real browser can legitimately error on
    // (issue #83's real error handling) — the delay from expanding the
    // overlay is enough time for that race to resolve either way. Either
    // state proves this is a real, tappable central transport control,
    // which is what "all controls tappable" is actually testing here.
    const centralControl = page.getByRole('button', { name: 'Pause', exact: true })
      .or(page.getByRole('button', { name: 'Retry playback' }))
    await expect(centralControl).toBeVisible()
    await expect(page.getByRole('button', { name: 'Forward 15 seconds' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip to end' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Playback speed' })).toBeVisible()

    await page.getByRole('button', { name: 'Collapse now playing' }).click()
    await expect(page.getByRole('button', { name: 'Collapse now playing' })).not.toBeVisible()
    await expect(page.getByTestId('player-bar')).toContainText('Deep Dive')
  })

  test('Admin is reachable via the bottom tab bar Settings tab', async ({ seededPage: page }) => {
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('button', { name: 'Admin dashboard' }).click()
    await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible()
  })

  test('the bottom tab bar is visible from the episode list, detail, and settings screens', async ({ seededPage: page }) => {
    const episodesTab = page.getByRole('button', { name: 'Episodes', exact: true })
    await expect(episodesTab).toBeVisible()

    await deepDiveItem(page).click()
    await expect(episodesTab).toBeVisible()

    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(episodesTab).toBeVisible()
  })

  test('the Now Playing tab is disabled until an episode is loaded, then expands the overlay', async ({ seededPage: page }) => {
    const nowPlayingTab = page.getByRole('button', { name: 'Listening' })
    await expect(nowPlayingTab).toBeDisabled()

    await deepDiveItem(page).click()
    await page.getByRole('button', { name: 'Play' }).click()
    await expect(nowPlayingTab).toBeEnabled()

    await page.getByRole('button', { name: /back to episodes/i }).click()
    await nowPlayingTab.click()
    await expect(page.getByRole('button', { name: 'Collapse now playing' })).toBeVisible()
  })

  test('resizing across the md boundary with an episode selected preserves state', async ({ seededPage: page }) => {
    await deepDiveItem(page).click()
    await expect(page.getByText('Season 1 · Episode 1')).toBeVisible()

    // Grow past the md breakpoint — desktop layout shows both panes at once.
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(deepDiveItem(page)).toBeVisible()
    await expect(page.getByText('Season 1 · Episode 1')).toBeVisible()

    // Shrink back to phone width — should still be on the detail pane, not
    // reset to the list, since focusedPane is viewport-agnostic state.
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByText('Season 1 · Episode 1')).toBeVisible()
    await expect(panelDiscussionItem(page)).not.toBeVisible()
  })
})

test.describe('Desktop listener UI unaffected by the mobile refactor', () => {
  test('full transport controls still resolve by role/label at desktop viewport', async ({ seededPage: page }) => {
    await deepDiveItem(page).click()
    await page.getByRole('button', { name: 'Play' }).click()
    await expect(page.getByRole('button', { name: 'Playback speed' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip to start' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip to end' })).toBeVisible()
  })

  test('the bottom tab bar is not rendered at desktop viewport', async ({ seededPage: page }) => {
    await expect(page.getByRole('button', { name: 'Listening' })).not.toBeVisible()
  })
})
