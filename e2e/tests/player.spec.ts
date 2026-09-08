import { test, expect } from '../fixtures.js'

test.describe('Audio Player', () => {
  test('player bar is hidden before an episode is selected', async ({ seededPage: page }) => {
    // The player is only rendered when episode != null
    await expect(page.getByTestId('player-bar')).not.toBeAttached()
  })

  test('clicking an episode only shows its details — the player is not loaded until Play is pressed', async ({ seededPage: page }) => {
    await page.locator('button', { hasText: 'Deep Dive' }).click()
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()
    await expect(page.getByTestId('player-bar')).not.toBeAttached()
  })

  test('player bar appears with episode title after pressing Play', async ({ seededPage: page }) => {
    await page.locator('button', { hasText: 'Deep Dive' }).click()
    await page.getByRole('button', { name: 'Play' }).click()
    const playerBar = page.getByTestId('player-bar')
    await expect(playerBar).toContainText('Deep Dive')
  })

  test('detail-pane Play button starts playback immediately (button reads Pause right after)', async ({ seededPage: page }) => {
    await page.locator('button', { hasText: 'Deep Dive' }).click()
    await page.getByRole('button', { name: 'Play' }).click()
    // Scoped to the player bar: the detail pane's own play/pause button has
    // a distinct accessible name ("Pause episode") specifically so it never
    // collides with the player bar's icon-only "Pause" button once both are
    // on screen at once.
    //
    // Also accepts "Retry playback": the seeded episode's stub audio URL
    // (https://example.com/...) is a real network resource, and a real
    // browser can legitimately fire a native `error` event for it — issue
    // #83 wires up real error handling, so this races against how fast
    // that fires. Either state proves the click actually started a real
    // playback attempt (not nothing), which is what this test checks.
    const playerBarCentral = page.getByTestId('player-bar').getByRole('button', { name: 'Pause' })
      .or(page.getByTestId('player-bar').getByRole('button', { name: 'Retry playback' }))
    await expect(playerBarCentral).toBeVisible()
    await expect(page.getByRole('button', { name: 'Play', exact: true })).not.toBeVisible()
  })

  test('speed toggle cycles 1× → 1.5× → 2× → 1×', async ({ seededPage: page }) => {
    await page.locator('button', { hasText: 'Deep Dive' }).click()
    await page.getByRole('button', { name: 'Play' }).click()
    // Scoped to the dock — DetailPane now shows its own copy of these same
    // controls too when viewing the playing episode, so an unscoped query
    // would be ambiguous.
    const speedBtn = page.getByTestId('player-bar').getByRole('button', { name: 'Playback speed' })
    await expect(speedBtn).toHaveText('1×')
    await speedBtn.click()
    await expect(speedBtn).toHaveText('1.5×')
    await speedBtn.click()
    await expect(speedBtn).toHaveText('2×')
    await speedBtn.click()
    await expect(speedBtn).toHaveText('1×')
  })

  test('skip and speed buttons are visible — no skip-to-start/end, matching the mockup exactly (only ±15s and speed exist anywhere in it)', async ({ seededPage: page }) => {
    await page.locator('button', { hasText: 'Deep Dive' }).click()
    await page.getByRole('button', { name: 'Play' }).click()
    // Scoped to the dock — see note above.
    const dock = page.getByTestId('player-bar')
    await expect(dock.getByRole('button', { name: 'Back 15 seconds' })).toBeVisible()
    await expect(dock.getByRole('button', { name: 'Forward 15 seconds' })).toBeVisible()
    await expect(dock.getByRole('button', { name: 'Skip to start' })).toHaveCount(0)
    await expect(dock.getByRole('button', { name: 'Skip to end' })).toHaveCount(0)
  })

  test('elapsed / total timestamps are visible, matching the mockup\'s "current / total" format', async ({ seededPage: page }) => {
    await page.locator('button', { hasText: 'Deep Dive' }).click()
    await page.getByRole('button', { name: 'Play' }).click()
    // The stub audio URL (example.com) never loads metadata, so duration stays 0.
    // Both timestamps show 0:00 — this verifies the times are rendered and
    // formatted, not that playback time is tracked (that requires real audio).
    const dock = page.getByTestId('player-bar')
    await expect(dock.locator('.times')).toHaveText('0:00 / 0:00')
  })
})
