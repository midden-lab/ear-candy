import { test, expect } from '../fixtures.js'

test.describe('Episode sharing', () => {
  test('sharing an episode and re-visiting the link fresh loads the right episode, paused', async ({ seededPage: page }) => {
    await page.locator('button', { hasText: 'Deep Dive' }).click()
    await page.getByRole('button', { name: 'Play' }).click()

    // The stub audio URL (example.com) never actually loads, so currentTime
    // stays 0 the whole test — below the 5s threshold ShareDialog uses to
    // offer a timestamp, so the trigger's accessible name is the no-timestamp
    // variant and the generated link has no `t` param. That's fine: this
    // test is about the episode identity round-tripping through a real
    // link, not the timestamp (which real-audio-decode gotchas make
    // unreliable to assert on in CI anyway — see CLAUDE.md).
    await page.getByTestId('player-bar').getByRole('button', { name: 'Share episode' }).click()
    const shareUrlText = (await page.locator('#share-dialog-url').textContent())?.trim()
    expect(shareUrlText).toBeTruthy()
    expect(shareUrlText).toContain('?episode=')
    await page.getByRole('button', { name: 'Close share dialog' }).click()

    const shared = new URL(shareUrlText!)
    // A brand-new page navigation, exactly like a listener clicking a link
    // shared to them cold — not a same-session in-app transition.
    await page.goto(shared.pathname + shared.search)

    const playerBar = page.getByTestId('player-bar')
    await expect(playerBar).toContainText('Deep Dive')
    // Deep links load the episode ready-to-play but paused — the shared
    // link never auto-plays (App.tsx's boot-time deep-link resolution).
    await expect(playerBar.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  })

  test('visiting a shared link for an episode not in the default season still loads it', async ({ seededPage: page, request }) => {
    const episodes = await request.get('/api/episodes').then(r => r.json()) as Array<{ id: number; title: string }>
    const panel = episodes.find(e => e.title === 'Panel Discussion')
    expect(panel).toBeTruthy()

    await page.goto(`/?episode=${panel!.id}&t=30`)

    const playerBar = page.getByTestId('player-bar')
    await expect(playerBar).toContainText('Panel Discussion')
    await expect(playerBar.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  })
})

test.describe('OG-tag crawler rendering (production single-container build only)', () => {
  // The server only renders crawler-facing OG HTML when serving the built
  // client from the single production container (SERVE_CLIENT=true) — inert
  // in dev's split client/server topology, see CLAUDE.md gotcha #44. CI's
  // `e2e` job always sets BASE_URL to the running production image
  // (:3000); local `make e2e` never sets it (defaults to the dev client at
  // :5173), so that's a reliable signal for whether this is reachable here.
  test.skip(!process.env.BASE_URL, 'crawler OG-tag rendering only exists in the production single-container build — run via CI, not `make e2e`')

  test('a known crawler user agent gets real OG meta tags for a shared episode', async ({ seededPage: page, request }) => {
    const episodes = await request.get('/api/episodes').then(r => r.json()) as Array<{ id: number; title: string; description: string }>
    const deepDive = episodes.find(e => e.title === 'Deep Dive')
    expect(deepDive).toBeTruthy()

    const res = await request.get(`/?episode=${deepDive!.id}&t=90`, {
      headers: { 'user-agent': 'Twitterbot/1.0' },
    })
    expect(res.status()).toBe(200)
    const body = await res.text()
    expect(body).toContain(`<meta property="og:title" content="${deepDive!.title}">`)
    expect(body).toContain('<meta property="og:site_name" content="Test Podcast">')
    expect(body).toContain(`episode=${deepDive!.id}&amp;t=90`)
  })

  test('a real browser user agent still gets the normal SPA shell for a shared link', async ({ seededPage: page, request }) => {
    const episodes = await request.get('/api/episodes').then(r => r.json()) as Array<{ id: number }>
    const res = await request.get(`/?episode=${episodes[0].id}`, {
      headers: { 'user-agent': 'Mozilla/5.0 (real browser)' },
    })
    expect(res.status()).toBe(200)
    const body = await res.text()
    expect(body).not.toContain('og:title')
  })
})
