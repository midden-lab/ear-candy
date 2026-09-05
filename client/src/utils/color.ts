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

/**
 * Lightens an arbitrary accent color for use against a dark canvas, so an
 * admin-chosen accent that reads fine on a light background (e.g. a
 * saturated purple or blue) doesn't lose contrast once the canvas goes
 * dark. Converts to HSL and floors lightness at 65%, clamped to a max of
 * 85% so an already-light accent isn't pushed toward white — note that for
 * an input already lighter than 85% (e.g. a pale yellow), this clamp
 * actually pulls lightness *down* slightly rather than lightening it
 * further, which is intentional (keeps very light accents from washing out
 * completely against the dark canvas) even though it's the opposite of
 * what "lighten" implies for that one edge case. Falls back to returning
 * `hex` unchanged if it isn't a parseable 6-digit hex color.
 */
export function getDarkModeAccent(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const { h, s, l } = rgbToHsl(rgb)
  const targetLightness = Math.min(0.85, Math.max(l, 0.65))
  return rgbToHex(hslToRgb({ h, s, l: targetLightness }))
}

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }): { h: number; s: number; l: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  switch (max) {
    case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)); break
    case gn: h = (bn - rn) / d + 2; break
    default: h = (rn - gn) / d + 4; break
  }
  return { h: h / 6, s, l }
}

function hslToRgb({ h, s, l }: { h: number; s: number; l: number }): { r: number; g: number; b: number } {
  if (s === 0) {
    const v = Math.round(l * 255)
    return { r: v, g: v, b: v }
  }
  const hue2rgb = (p: number, q: number, t: number): number => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  }
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
