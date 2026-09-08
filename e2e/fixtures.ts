import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'changeme'

type Fixtures = {
  seededPage: Page
  adminPage: Page
}

export const test = base.extend<Fixtures>({
  seededPage: async ({ page, request }, use) => {
    let seasonId: number | undefined
    try {
      // Authenticate the isolated API request context
      const loginRes = await request.post('/api/admin/login', {
        data: { password: PASSWORD },
      })
      if (!loginRes.ok()) {
        throw new Error(`Fixture setup: admin login failed (${loginRes.status()}) — check TEST_ADMIN_PASSWORD env var`)
      }

      // Seed known settings so listener tests see predictable podcast name
      await request.patch('/api/admin/settings', {
        data: { podcast_name: 'Test Podcast' },
      })

      // Create one season
      const seasonRes = await request.post('/api/admin/seasons', {
        data: { number: 1, title: 'Season 1' },
      })
      const season = await seasonRes.json() as { id: number }
      seasonId = season.id

      // Create two episodes
      await request.post('/api/admin/episodes', {
        data: {
          season_id: season.id,
          number: 1,
          title: 'Deep Dive',
          guests: 'Alice Chen',
          tags: 'interview, tech',
          description: 'A deep dive into software engineering.',
          duration_seconds: 1800,
          publish_date: '2024-01-15',
          audio_type: 'url',
          audio_path: 'https://example.com/ep1.mp3',
        },
      })
      await request.post('/api/admin/episodes', {
        data: {
          season_id: season.id,
          number: 2,
          title: 'Panel Discussion',
          guests: 'Bob Smith',
          tags: 'panel',
          description: 'A roundtable on software development.',
          duration_seconds: 3600,
          publish_date: '2024-02-01',
          audio_type: 'url',
          audio_path: 'https://example.com/ep2.mp3',
        },
      })

      await page.goto('/')
      await expect(page.getByRole('heading')).toBeVisible()
      await use(page)
    } finally {
      // Teardown: delete season (cascades to episodes) if it was created
      if (seasonId !== undefined) {
        await request.delete(`/api/admin/seasons/${seasonId}`)
      }
      // Restore podcast name
      await request.patch('/api/admin/settings', {
        data: { podcast_name: 'My Podcast' },
      })
    }
  },

  adminPage: async ({ page }, use) => {
    // Auto-accept native confirm() dialogs (used by season/episode delete)
    page.on('dialog', dialog => dialog.accept())
    // Authenticate the browser context (page.request shares the browser's cookie jar)
    await page.request.post('/api/admin/login', {
      data: { password: PASSWORD },
    })
    await page.goto('/')
    // Open admin panel via the settings gear icon
    await page.getByRole('button', { name: 'Admin' }).click()
    await expect(page.getByText('Ear Candy Admin')).toBeVisible()
    await use(page)
  },
})

export { expect }
