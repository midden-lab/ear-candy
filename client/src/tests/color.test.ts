import { getContrastTextColor } from '../utils/color'

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
