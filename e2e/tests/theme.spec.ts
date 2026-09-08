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

  test('Dark is shown as the active toggle on load (dark is the default)', async ({ page }) => {
    const dark = page.getByRole('button', { name: 'Dark' })
    const light = page.getByRole('button', { name: 'Light' })
    await expect(dark).toHaveAttribute('aria-pressed', 'true')
    await expect(light).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('html')).toHaveClass(/dark/)
  })

  test('clicking Light removes dark class from <html> and marks Light active', async ({ page }) => {
    await page.getByRole('button', { name: 'Light' }).click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    await expect(page.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('clicking Dark again adds dark class back and marks Dark active', async ({ page }) => {
    await page.getByRole('button', { name: 'Light' }).click()
    await page.getByRole('button', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('light mode preference persists across page reload', async ({ page }) => {
    await page.getByRole('button', { name: 'Light' }).click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    const stored = await page.evaluate(() => localStorage.getItem('theme'))
    expect(stored).toBe('light')
    await page.reload()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  })
})
