import { test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const screenshotsDir = path.join(process.cwd(), 'screenshots')

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true })
}

test('before - player with episode selected', async ({ page }) => {
  await page.goto('/')
  await page.waitForTimeout(800)
  const episodeBtn = page.locator('button').filter({ hasText: /^\d+\s/ }).first()
  if (await episodeBtn.count() > 0) {
    await episodeBtn.click()
    await page.waitForTimeout(500)
  }
  await page.screenshot({ path: path.join(screenshotsDir, 'before-player.png') })
})

test('before - admin login overlap', async ({ page }) => {
  await page.goto('/')
  await page.waitForTimeout(800)
  const episodeBtn = page.locator('button').filter({ hasText: /^\d+\s/ }).first()
  if (await episodeBtn.count() > 0) {
    await episodeBtn.click()
    await page.waitForTimeout(500)
  }
  await page.getByRole('button', { name: 'Admin' }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(screenshotsDir, 'before-admin-overlap.png') })
})
