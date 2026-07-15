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
    await expect(page.getByTestId('player-bar').getByRole('button', { name: 'Pause' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Play', exact: true })).not.toBeVisible()
  })

  test('speed toggle cycles 1× → 1.5× → 2× → 1×', async ({ seededPage: page }) => {
    await page.locator('button', { hasText: 'Deep Dive' }).click()
    await page.getByRole('button', { name: 'Play' }).click()
    const speedBtn = page.getByRole('button', { name: 'Playback speed' })
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
    await page.getByRole('button', { name: 'Play' }).click()
    await expect(page.getByRole('button', { name: 'Skip to start' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Back 15 seconds' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Forward 15 seconds' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip to end' })).toBeVisible()
  })

  test('elapsed and remaining timestamps are visible', async ({ seededPage: page }) => {
    await page.locator('button', { hasText: 'Deep Dive' }).click()
    await page.getByRole('button', { name: 'Play' }).click()
    // The stub audio URL (example.com) never loads metadata, so duration stays 0.
    // Both timestamps show 0:00 — this verifies the spans are rendered and formatted,
    // not that playback time is tracked (that requires real audio).
    const playerBar = page.getByTestId('player-bar')
    const elapsed = playerBar.locator('span').first()
    const remaining = playerBar.locator('span').last()
    await expect(elapsed).toHaveText('0:00')
    await expect(remaining).toHaveText('0:00')
  })
})
