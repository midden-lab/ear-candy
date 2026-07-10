import { test } from '@playwright/test'

test('before - player with episode selected', async ({ page }) => {
  await page.goto('/')
  await page.waitForTimeout(800)
  const episodeBtn = page.locator('button').filter({ hasText: /Ep \d/ }).first()
  if (await episodeBtn.count() > 0) {
    await episodeBtn.click()
    await page.waitForTimeout(500)
  }
  await page.screenshot({ path: '/tmp/before-player.png' })
})

test('before - admin login overlap', async ({ page }) => {
  await page.goto('/')
  await page.waitForTimeout(800)
  const episodeBtn = page.locator('button').filter({ hasText: /Ep \d/ }).first()
  if (await episodeBtn.count() > 0) {
    await episodeBtn.click()
    await page.waitForTimeout(500)
  }
  await page.getByRole('button', { name: 'Admin settings' }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: '/tmp/before-admin-overlap.png' })
})
