interface EpisodeCoverArtProps {
  thumbPath: string | null
  detailPath: string | null
  alt: string
  /**
   * 'thumb' renders only the small thumbnail asset (list rows, mini-bar —
   * never worth pulling the larger detail image). 'responsive' renders a
   * srcSet so the browser picks the right size for the viewport (detail
   * pane, now-playing overlay).
   */
  variant: 'thumb' | 'responsive'
  className?: string
}

/**
 * Renders nothing if no art exists at either size — callers that want a
 * placeholder slot handle that themselves, since the right placeholder
 * treatment differs per call site.
 */
export default function EpisodeCoverArt({ thumbPath, detailPath, alt, variant, className }: EpisodeCoverArtProps) {
  if (variant === 'thumb') {
    if (!thumbPath) return null
    return (
      <img
        src={thumbPath}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={className}
      />
    )
  }

  // 'responsive': prefer the detail path as the base src (best quality
  // fallback for browsers that ignore srcSet), but still offer the thumb
  // as the smaller candidate so a compact viewport doesn't pull the full
  // detail asset over a slow connection.
  const src = detailPath ?? thumbPath
  if (!src) return null

  const srcSet = thumbPath && detailPath && thumbPath !== detailPath
    ? `${thumbPath} 150w, ${detailPath} 640w`
    : undefined

  return (
    <img
      src={src}
      srcSet={srcSet}
      sizes={srcSet ? '(max-width: 768px) 150px, 640px' : undefined}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
    />
  )
}
