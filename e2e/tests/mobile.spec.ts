import { test, expect } from '../fixtures.js'

// EpisodeItem's accessible name is "{number} {title} {time}" (matching the
// mockup's exact 3-field row — plans/010). Anchoring on the leading number
// (rather than a generic hasText match) uniquely identifies the list item
// regardless of whether it's rendered inside <aside> (desktop) or <main>
// (mobile list pane) — and regardless of the mini-player, whose own
// aria-label ("Now playing: ...") never starts with a digit.
const deepDiveItem = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: /^\d+\s+Deep Dive/ })
const panelDiscussionItem = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: /^\d+\s+Panel Discussion/ })

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
    await page.getByRole('button', { name: 'Play episode' }).click()
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

  test('tapping the mini-bar navigates to the playing episode\'s detail view, with all transport controls tappable there', async ({ seededPage: page }) => {
    // There is no full-screen "now playing" overlay anymore — tapping the
    // mini-bar (outside its own Play/Pause button) routes to the same
    // canonical detail view reached via the Playing tab or a normal row tap.
    await deepDiveItem(page).click()
    // Pressing the detail pane's Play button starts playback immediately, so
    // the transport button already reads "Pause episode" by the time we
    // navigate away and back via the mini-bar.
    await page.getByRole('button', { name: 'Play episode' }).click()
    await page.getByRole('button', { name: /back to episodes/i }).click()
    await page.getByRole('button', { name: /now playing/i }).click()

    await expect(page.getByRole('heading', { name: 'Deep Dive' })).toBeVisible()
    const playingTab = page.getByRole('button', { name: 'Playing', exact: true })
    await expect(playingTab).toHaveAttribute('aria-current', 'true')

    await expect(page.getByRole('button', { name: 'Back 15 seconds' })).toBeVisible()
    // Also accepts "Retry episode": the seeded episode's stub audio URL is a
    // real network resource a real browser can legitimately error on
    // (issue #83's real error handling) — this races against how fast that
    // resolves. Either state proves this is a real, tappable central
    // control, which is what "all controls tappable" is actually testing.
    const centralControl = page.getByRole('button', { name: 'Pause episode' })
      .or(page.getByRole('button', { name: 'Retry episode' }))
    await expect(centralControl).toBeVisible()
    await expect(page.getByRole('button', { name: 'Forward 15 seconds' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Playback speed' })).toBeVisible()
    await expect(page.getByTestId('player-bar')).toContainText('Deep Dive')
  })

  test('Admin is reachable via the bottom tab bar Settings tab', async ({ seededPage: page }) => {
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('button', { name: 'Admin', exact: true }).click()
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

  test('the Playing tab is always enabled, and navigates to the detail placeholder when nothing has ever played', async ({ seededPage: page }) => {
    const playingTab = page.getByRole('button', { name: 'Playing', exact: true })
    await expect(playingTab).toBeEnabled()
    await playingTab.click()
    await expect(page.getByText('Select an episode to begin')).toBeVisible()
    await expect(playingTab).toHaveAttribute('aria-current', 'true')
  })

  test('tapping Playing after starting an episode navigates to its detail view and highlights the Playing tab', async ({ seededPage: page }) => {
    const playingTab = page.getByRole('button', { name: 'Playing', exact: true })
    await deepDiveItem(page).click()
    await page.getByRole('button', { name: 'Play episode' }).click()
    await page.getByRole('button', { name: /back to episodes/i }).click()
    await expect(playingTab).not.toHaveAttribute('aria-current', 'true')

    await playingTab.click()
    await expect(page.getByRole('heading', { name: 'Deep Dive' })).toBeVisible()
    await expect(playingTab).toHaveAttribute('aria-current', 'true')
  })

  test('browsing to a different, non-playing episode\'s detail highlights no tab at all', async ({ seededPage: page }) => {
    await deepDiveItem(page).click()
    await page.getByRole('button', { name: 'Play episode' }).click()
    await page.getByRole('button', { name: /back to episodes/i }).click()
    await panelDiscussionItem(page).click()

    await expect(page.getByRole('button', { name: 'Playing', exact: true })).not.toHaveAttribute('aria-current', 'true')
    await expect(page.getByRole('button', { name: 'Episodes', exact: true })).not.toHaveAttribute('aria-current', 'true')
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).not.toHaveAttribute('aria-current', 'true')
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
    // Scoped to the dock (player-bar) — DetailPane now shows its own copy of
    // these same controls too when viewing the playing episode, so an
    // unscoped query would be ambiguous. This test's own concern is
    // specifically the persistent dock, which is what "unaffected by the
    // mobile refactor" is actually about.
    const dock = page.getByTestId('player-bar')
    await expect(dock.getByRole('button', { name: 'Playback speed' })).toBeVisible()
    await expect(dock.getByRole('button', { name: 'Back 15 seconds' })).toBeVisible()
    await expect(dock.getByRole('button', { name: 'Forward 15 seconds' })).toBeVisible()
  })

  test('the mobile bottom tab bar is not rendered at desktop viewport', async ({ seededPage: page }) => {
    await expect(page.getByRole('button', { name: 'Playing', exact: true })).not.toBeVisible()
  })
})
