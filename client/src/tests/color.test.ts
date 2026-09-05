import { getContrastTextColor, getDarkModeAccent } from '../utils/color'

describe('getContrastTextColor', () => {
  it('returns white text for a dark accent', () => {
    expect(getContrastTextColor('#000000')).toBe('#ffffff')
    expect(getContrastTextColor('#5a3ef5')).toBe('#ffffff')
  })

  it('returns black text for a light/pale accent', () => {
    expect(getContrastTextColor('#ffffff')).toBe('#000000')
    expect(getContrastTextColor('#ffff00')).toBe('#000000')
  })

  it('handles hex without a leading #', () => {
    expect(getContrastTextColor('000000')).toBe('#ffffff')
  })

  it('falls back to white for an invalid hex', () => {
    expect(getContrastTextColor('not-a-color')).toBe('#ffffff')
  })
})

describe('getDarkModeAccent', () => {
  const HEX_RE = /^#[0-9a-f]{6}$/

  it('lightens a mid-lightness saturated accent up toward the target range', () => {
    const result = getDarkModeAccent('#5a3ef5')
    expect(result).toMatch(HEX_RE)
    expect(result).not.toBe('#5a3ef5')
    expect(result).toBe('#6e55f6')
  })

  it('lightens pure black to a mid-gray, not pure white', () => {
    const result = getDarkModeAccent('#000000')
    expect(result).toBe('#a6a6a6')
  })

  it('clamps an already-very-light accent down to the 85% ceiling rather than pushing it toward white', () => {
    // #ffffff is L=1.0 going in — clamped to the 85% ceiling, not left at 100%.
    expect(getDarkModeAccent('#ffffff')).toBe('#d9d9d9')
    // A pale cream (L≈0.94 going in) hits the same ceiling.
    expect(getDarkModeAccent('#fff5e0')).toBe('#ffe6b3')
  })

  it('always returns a valid 6-digit hex for a valid input', () => {
    for (const input of ['#5a3ef5', '#000000', '#ffffff', '#808080', '#00ff00']) {
      expect(getDarkModeAccent(input)).toMatch(HEX_RE)
    }
  })

  it('falls back to returning the input unchanged for an invalid hex', () => {
    expect(getDarkModeAccent('not-a-color')).toBe('not-a-color')
  })
})
