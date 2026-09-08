import { test, expect } from '../fixtures.js'

test.describe('Listener UI', () => {
  test('shows podcast name in sidebar header', async ({ seededPage: page }) => {
    await expect(page.getByRole('heading', { name: 'Test Podcast' })).toBeVisible()
  })

  test('shows season tab', async ({ seededPage: page }) => {
    await expect(page.getByRole('button', { name: 'Season 1' })).toBeVisible()
  })

  test('episode list row shows number, title, and duration — matching the mockup\'s exact 3-field row (no guests, no thumbnail)', async ({ seededPage: page }) => {
    const item = page.locator('button.row', { hasText: 'Deep Dive' })
    await expect(item).toBeVisible()
    await expect(item.locator('.row-no')).toHaveText('1')
    await expect(item).toContainText('30:00') // 1800s
    await expect(item).not.toContainText('Alice Chen')
    await expect(item.locator('img')).toHaveCount(0)
  })

  test('clicking an episode gives it a shadow highlight (.row.is-viewed), not a border or a solid accent fill', async ({ seededPage: page }) => {
    const item = page.locator('button.row', { hasText: 'Deep Dive' })
    await item.click()
    await expect(item).toHaveAttribute('aria-current', 'true')
    await expect(item).toHaveClass(/\bis-viewed\b/)
    await expect(item).not.toHaveClass(/border-l-2/)
    await expect(item).not.toHaveClass(/bg-\[var\(--accent\)\]/)
  })

  test('detail pane shows season/episode label', async ({ seededPage: page }) => {
    await page.locator('button.row', { hasText: 'Deep Dive' }).click()
    await expect(page.getByText('Season 1 · Episode 1')).toBeVisible()
  })

  test('detail pane shows guests as plain text ("With <strong>Name</strong>"), not a pill', async ({ seededPage: page }) => {
    await page.locator('button.row', { hasText: 'Deep Dive' }).click()
    const guest = page.locator('main').getByText('Alice Chen')
    await expect(guest).toBeVisible()
    await expect(guest).toHaveJSProperty('tagName', 'STRONG')
  })

  test('detail pane does not render tags anywhere — dropped in the direct mockup port (plans/010)', async ({ seededPage: page }) => {
    await page.locator('button.row', { hasText: 'Deep Dive' }).click()
    await expect(page.locator('main').getByText('interview')).toHaveCount(0)
  })

  test('detail pane shows "About" label before description, matching the mockup exactly', async ({ seededPage: page }) => {
    await page.locator('button.row', { hasText: 'Deep Dive' }).click()
    await expect(page.getByText('About', { exact: true })).toBeVisible()
    await expect(page.getByText('A deep dive into software engineering.')).toBeVisible()
  })
})
