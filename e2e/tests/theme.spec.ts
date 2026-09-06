import { test, expect } from '@playwright/test'

test.describe('Dark/light mode toggle', () => {
  test.use({ colorScheme: 'light' })

  test.beforeEach(async ({ page }) => {
    // Clear localStorage so each test starts from the app's default state —
    // dark, unless a prior toggle explicitly saved 'light' (see useTheme.ts).
    await page.goto('/')
    await page.evaluate(() => localStorage.removeItem('theme'))
    // reload is required — React's useTheme hook reads localStorage during initial
    // render, so removing the key from a live page doesn't reset in-memory state
    await page.reload()
  })

  test('moon badge is visible in the bottom-right corner on load (dark is the default)', async ({ page }) => {
    const badge = page.getByRole('button', { name: /toggle light mode/i })
    await expect(badge).toBeVisible()
    await expect(badge).toContainText('🌙')
  })

  test('clicking the badge removes dark class from <html> and shows sun', async ({ page }) => {
    const badge = page.getByRole('button', { name: /toggle light mode/i })
    await badge.click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    await expect(page.getByRole('button', { name: /toggle dark mode/i })).toContainText('☀️')
  })

  test('clicking again adds dark class and shows moon', async ({ page }) => {
    const badge = page.getByRole('button', { name: /toggle light mode/i })
    await badge.click()  // → light
    await page.getByRole('button', { name: /toggle dark mode/i }).click()  // → dark
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.getByRole('button', { name: /toggle light mode/i })).toContainText('🌙')
  })

  test('light mode preference persists across page reload', async ({ page }) => {
    await page.getByRole('button', { name: /toggle light mode/i }).click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    const stored = await page.evaluate(() => localStorage.getItem('theme'))
    expect(stored).toBe('light')
    await page.reload()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  })
})
