import { test, expect } from '../fixtures.js'
import { test as base } from '@playwright/test'

base.describe('Admin login', () => {
  base.test('wrong password shows error message', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Admin settings' }).click()
    await page.getByLabel('Password').fill('wrongpassword')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toContainText('Invalid password')
  })

  base.test('correct password navigates to admin panel', async ({ page }) => {
    const pw = process.env.TEST_ADMIN_PASSWORD ?? 'changeme'
    await page.goto('/')
    await page.getByRole('button', { name: 'Admin settings' }).click()
    await page.getByLabel('Password').fill(pw)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Ear Candy Admin')).toBeVisible()
  })
})

test.describe('Admin panel — season management', () => {
  test.afterEach(async ({ adminPage: page }) => {
    const seasons = page.getByTestId('season-card')
    const lastSeason = seasons.last()
    if (await lastSeason.isVisible()) {
      await lastSeason.locator('div').first().getByRole('button', { name: 'Delete' }).click()
    }
  })

  test('create a new season — it appears in episode manager', async ({ adminPage: page }) => {
    const initialCount = await page.getByTestId('season-card').count()
    await page.getByRole('button', { name: '+ New Season' }).click()
    await expect(page.getByTestId('season-card')).toHaveCount(initialCount + 1)
  })

  test('delete a season — it disappears', async ({ adminPage: page }) => {
    const seasons = page.getByTestId('season-card')
    // Record initial count before creating the season to delete
    const initialCount = await seasons.count()
    await page.getByRole('button', { name: '+ New Season' }).click()
    // Wait for the new season to appear
    await expect(seasons).toHaveCount(initialCount + 1)
    const lastSeason = seasons.last()
    // Delete it via the season header's Delete button
    await lastSeason.locator('div').first().getByRole('button', { name: 'Delete' }).click()
    await expect(seasons).toHaveCount(initialCount)
  })
})

test.describe('Admin panel — episode management', () => {
  test.beforeEach(async ({ adminPage: page }) => {
    // Create a season to work with and wait for it to appear in the DOM
    const seasons = page.getByTestId('season-card')
    const countBefore = await seasons.count()
    await page.getByRole('button', { name: '+ New Season' }).click()
    await expect(seasons).toHaveCount(countBefore + 1)
  })

  test.afterEach(async ({ adminPage: page }) => {
    // Delete the last season (and its episodes via cascade)
    // Scope to the season header div to avoid matching episode Delete buttons
    const seasons = page.getByTestId('season-card')
    const lastSeason = seasons.last()
    if (await lastSeason.isVisible()) {
      // The season header is the first child div (bg-zinc-900) containing Edit/Delete
      await lastSeason.locator('div').first().getByRole('button', { name: 'Delete' }).click()
    }
  })

  test('create an episode — it appears in the season block', async ({ adminPage: page }) => {
    const lastSeason = page.getByTestId('season-card').last()
    await lastSeason.getByRole('button', { name: '+ New Episode' }).click()
    // Fill in the episode form panel
    await page.getByLabel('Title').fill('My Test Episode')
    await page.getByLabel('Episode #').fill('1')
    await page.getByLabel('Publish Date').fill('2024-06-01')
    await page.getByLabel('Audio URL').fill('https://example.com/test.mp3')
    await page.getByRole('button', { name: 'Save' }).click()
    // Episode appears in season block
    await expect(lastSeason.getByText('My Test Episode')).toBeVisible()
  })

  test('create an episode with uploaded audio — it appears in the season block', async ({ adminPage: page }) => {
    const lastSeason = page.getByTestId('season-card').last()
    await lastSeason.getByRole('button', { name: '+ New Episode' }).click()
    // Fill in the episode form panel with upload
    await page.getByLabel('Title').fill('Uploaded Episode')
    await page.getByLabel('Episode #').fill('2')
    await page.getByLabel('Publish Date').fill('2024-06-02')
    await page.getByLabel('Audio Type').selectOption('upload')
    await page.getByLabel('Audio File').setInputFiles('/Users/m8ttyb/workspace/midden-lab/ear_candy/e2e/fixtures/test-audio.mp3')
    await expect(page.getByText(/uploaded:/i)).toBeVisible()
    await page.getByRole('button', { name: 'Save' }).click()
    // Episode appears in season block
    await expect(lastSeason.getByText('Uploaded Episode')).toBeVisible()
  })

  test('edit an episode title — change is reflected in the list', async ({ adminPage: page }) => {
    // Create an episode first
    const lastSeason = page.getByTestId('season-card').last()
    await lastSeason.getByRole('button', { name: '+ New Episode' }).click()
    await page.getByLabel('Title').fill('Original Title')
    await page.getByLabel('Episode #').fill('1')
    await page.getByLabel('Publish Date').fill('2024-06-01')
    await page.getByLabel('Audio URL').fill('https://example.com/test.mp3')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(lastSeason.getByText('Original Title')).toBeVisible()
    // Edit it — scope to the episode row to avoid matching the season header's Edit button
    const epRow = lastSeason.locator('div', { hasText: 'Original Title' }).filter({ has: page.getByRole('button', { name: 'Edit' }) })
    await epRow.getByRole('button', { name: 'Edit' }).click()
    await page.getByLabel('Title').clear()
    await page.getByLabel('Title').fill('Updated Title')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(lastSeason.getByText('Updated Title')).toBeVisible()
    await expect(lastSeason.getByText('Original Title')).not.toBeVisible()
  })

  test('delete an episode — it disappears from the list', async ({ adminPage: page }) => {
    // Create an episode first
    const lastSeason = page.getByTestId('season-card').last()
    await lastSeason.getByRole('button', { name: '+ New Episode' }).click()
    await page.getByLabel('Title').fill('Episode To Delete')
    await page.getByLabel('Episode #').fill('1')
    await page.getByLabel('Publish Date').fill('2024-06-01')
    await page.getByLabel('Audio URL').fill('https://example.com/test.mp3')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(lastSeason.getByText('Episode To Delete')).toBeVisible()
    // Delete it
    const epRow = lastSeason.locator('div', { hasText: 'Episode To Delete' }).filter({ has: page.getByRole('button', { name: 'Delete' }) })
    await epRow.getByRole('button', { name: 'Delete' }).click()
    await expect(lastSeason.getByText('Episode To Delete')).not.toBeVisible()
  })
})

test.describe('Admin panel — settings', () => {
  test.afterEach(async ({ adminPage: page }) => {
    await page.request.patch('/api/admin/settings', {
      data: { podcast_name: 'My Podcast' },
    })
  })

  test('update podcast name — save succeeds', async ({ adminPage: page }) => {
    // Navigate to Settings tab
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    // Update podcast name
    await page.getByLabel('Podcast Name').clear()
    await page.getByLabel('Podcast Name').fill('My E2E Podcast')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toContainText('Settings saved!')
  })
})

test.describe('Admin panel — logout', () => {
  test('Sign out returns to the listener UI', async ({ adminPage: page }) => {
    await page.getByRole('button', { name: 'Sign out' }).click()
    // Listener shell is visible (AppShell has a <nav> and a <main>)
    await expect(page.locator('nav').first()).toBeVisible()
    await expect(page.locator('main').first()).toBeVisible()
    // Admin header is gone
    await expect(page.getByText('Ear Candy Admin')).not.toBeVisible()
  })
})
