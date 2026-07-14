import type { Episode, Settings } from '../types.js'

// Twitter/X, Facebook, and other link-preview crawlers fetch a shared URL
// and read <meta property="og:..."> tags from the raw HTML — they don't
// execute JavaScript, so this client-rendered SPA's single static
// index.html would otherwise always show a generic (or empty) preview card
// regardless of which episode was shared. This is the standard, minimal
// pattern every SPA uses for this exact problem: detect known bot user
// agents and serve them a tiny static HTML snippet with the right meta
// tags instead of the real app shell.
const CRAWLER_USER_AGENT_PATTERN = /Twitterbot|facebookexternalhit|Slackbot|Discordbot/i

export function isKnownCrawler(userAgent: string | undefined): boolean {
  return !!userAgent && CRAWLER_USER_AGENT_PATTERN.test(userAgent)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderEpisodeOgHtml(episode: Episode, settings: Settings, shareUrl: string, origin: string): string {
  const title = escapeHtml(episode.title)
  const siteName = escapeHtml(settings.podcast_name)
  const description = escapeHtml(episode.description || settings.tagline || '')
  const image = episode.cover_art_path ?? settings.cover_art_path
  // Cover art is stored/returned as a site-relative path (e.g. /images/<uuid>.webp)
  // — the Open Graph spec requires og:image to be an absolute URL, or
  // Twitter/Facebook/Slack/Discord's unfurlers silently fail to resolve it
  // and the preview card renders with no image at all.
  const absoluteImage = image ? (image.startsWith('http://') || image.startsWith('https://') ? image : `${origin}${image}`) : null
  const imageTag = absoluteImage ? `<meta property="og:image" content="${escapeHtml(absoluteImage)}">\n    ` : ''

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${title} — ${siteName}</title>
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:url" content="${escapeHtml(shareUrl)}">
    <meta property="og:site_name" content="${siteName}">
    <meta property="og:type" content="website">
    ${imageTag}<meta name="twitter:card" content="summary_large_image">
    <meta http-equiv="refresh" content="0; url=${escapeHtml(shareUrl)}">
  </head>
  <body></body>
</html>
`
}
