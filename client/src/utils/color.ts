/**
 * Picks readable black/white text for an arbitrary background color, using
 * WCAG relative luminance. Needed because `accent_color` is admin-supplied
 * (Settings form) with no contrast validation — a hardcoded `text-white`
 * next to a pale admin-chosen accent would be unreadable.
 */
export function getContrastTextColor(hex: string): '#000000' | '#ffffff' {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#ffffff'
  const luminance = relativeLuminance(rgb)
  // WCAG-recommended threshold for picking black vs. white text.
  return luminance > 0.179 ? '#000000' : '#ffffff'
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!match) return null
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  }
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const [rs, gs, bs] = [r, g, b].map(channel => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}
