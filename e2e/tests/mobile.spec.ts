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

  test('player mini-bar is visible after selecting an episode and does not overlap the overflow menu', async ({ seededPage: page }) => {
    await deepDiveItem(page).click()
    const miniBar = page.getByTestId('player-bar')
    await expect(miniBar).toBeVisible()
    await expect(miniBar).toContainText('Deep Dive')

    // Back to the list, where the overflow menu header is shown, and confirm
    // the mini-bar (still playing) and the header's overflow button don't overlap.
    await page.getByRole('button', { name: /back to episodes/i }).click()
    const overflowButton = page.getByRole('button', { name: 'More options' })
    await expect(overflowButton).toBeVisible()
    const barBox = await miniBar.boundingBox()
    const overflowBox = await overflowButton.boundingBox()
    expect(barBox).not.toBeNull()
    expect(overflowBox).not.toBeNull()
    if (barBox && overflowBox) {
      expect(overflowBox.y + overflowBox.height).toBeLessThanOrEqual(barBox.y)
    }
  })

  test('tapping the mini-bar opens the full-screen now-playing overlay with all controls tappable', async ({ seededPage: page }) => {
    await deepDiveItem(page).click()
    // Selecting an episode starts playback immediately, so the transport
    // button already reads "Pause" by the time the overlay opens.
    await page.getByRole('button', { name: /now playing/i }).click()

    await expect(page.getByRole('button', { name: 'Collapse now playing' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip to start' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Back 15 seconds' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Forward 15 seconds' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip to end' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Playback speed' })).toBeVisible()

    await page.getByRole('button', { name: 'Collapse now playing' }).click()
    await expect(page.getByRole('button', { name: 'Collapse now playing' })).not.toBeVisible()
    await expect(page.getByTestId('player-bar')).toContainText('Deep Dive')
  })

  test('Admin is reachable via the mobile header overflow menu', async ({ seededPage: page }) => {
    await page.getByRole('button', { name: 'More options' }).click()
    await page.getByText('Admin', { exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible()
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
    await expect(page.getByRole('button', { name: 'Playback speed' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip to start' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip to end' })).toBeVisible()
  })

  test('mobile header and overflow menu are not rendered at desktop viewport', async ({ seededPage: page }) => {
    await expect(page.getByRole('button', { name: 'More options' })).not.toBeVisible()
  })
})
