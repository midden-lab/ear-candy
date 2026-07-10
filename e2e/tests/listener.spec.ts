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
    const pill = page.locator('main').getByText('Alice Chen')
    await expect(pill).toBeVisible()
    await expect(pill).toHaveClass(/bg-blue-900/)
  })

  test('detail pane shows tag as purple pill', async ({ seededPage: page }) => {
    await page.locator('button', { hasText: 'Deep Dive' }).click()
    const pill = page.locator('main').getByText('interview')
    await expect(pill).toBeVisible()
    await expect(pill).toHaveClass(/bg-purple-900/)
  })

  test('detail pane shows About this episode label', async ({ seededPage: page }) => {
    await page.locator('button', { hasText: 'Deep Dive' }).click()
    await expect(page.getByText('About this episode')).toBeVisible()
    await expect(page.getByText('A deep dive into software engineering.')).toBeVisible()
  })
})
