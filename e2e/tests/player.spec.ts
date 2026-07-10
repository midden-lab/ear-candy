import { test, expect } from '../fixtures.js'

test.describe('Audio Player', () => {
  test('player bar is hidden before an episode is selected', async ({ seededPage: page }) => {
    // The player is only rendered when episode != null
    await expect(page.getByTestId('player-bar')).not.toBeAttached()
  })

  test('player bar appears with episode title after clicking an episode', async ({ seededPage: page }) => {
    await page.locator('button', { hasText: 'Deep Dive' }).click()
    // Episode title shown in player bar
    const playerBar = page.getByTestId('player-bar')
    await expect(playerBar).toContainText('Deep Dive')
  })

  test('Play button aria-label becomes Pause after clicking', async ({ seededPage: page }) => {
    await page.locator('button', { hasText: 'Deep Dive' }).click()
    const playBtn = page.getByRole('button', { name: 'Play' })
    await playBtn.click()
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Play', exact: true })).not.toBeVisible()
  })

  test('speed toggle cycles 1× → 1.5× → 2× → 1×', async ({ seededPage: page }) => {
    await page.locator('button', { hasText: 'Deep Dive' }).click()
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
    await expect(page.getByRole('button', { name: 'Skip to start' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Back 15 seconds' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Forward 15 seconds' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip to end' })).toBeVisible()
  })

  test('elapsed and remaining timestamps are visible', async ({ seededPage: page }) => {
    await page.locator('button', { hasText: 'Deep Dive' }).click()
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
