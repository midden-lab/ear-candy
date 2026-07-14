// Builds shareable episode deep links (`?episode={id}&t={seconds}`) and the
// corresponding social share-intent URLs. `t` is omitted entirely for a
// "from the beginning" share rather than written as `t=0`, so its mere
// presence/absence unambiguously signals intent to both the client's
// boot-time parser and the server's OG-tag renderer.

export function buildShareUrl(episodeId: number, t?: number): string {
  const url = new URL('/', window.location.origin)
  url.searchParams.set('episode', String(episodeId))
  if (t !== undefined && t > 0) url.searchParams.set('t', String(Math.floor(t)))
  return url.toString()
}

export function buildTweetIntentUrl(shareUrl: string, episodeTitle: string): string {
  const text = `Listening to "${episodeTitle}"`
  return `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`
}

export function buildFacebookIntentUrl(shareUrl: string): string {
  // Facebook's sharer only ever honors the `u` param — it deliberately
  // ignores any pre-filled text/title params, so there's nothing else to pass.
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`
}
