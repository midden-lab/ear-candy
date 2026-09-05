import { formatTime, clampSeekTime, nextSpeed, SPEEDS } from '../utils/playback'

describe('formatTime', () => {
  it('formats seconds as m:ss', () => {
    expect(formatTime(65)).toBe('1:05')
    expect(formatTime(3)).toBe('0:03')
    expect(formatTime(0)).toBe('0:00')
  })

  it('floors fractional seconds', () => {
    expect(formatTime(65.9)).toBe('1:05')
  })

  it('shows a negative sign only when showSign is true and the value is negative', () => {
    expect(formatTime(-30)).toBe('0:30')
    expect(formatTime(-30, true)).toBe('-0:30')
    expect(formatTime(30, true)).toBe('0:30')
  })
})

describe('clampSeekTime', () => {
  it('clamps below zero up to zero', () => {
    expect(clampSeekTime(-10, 100)).toBe(0)
  })

  it('clamps above duration down to duration', () => {
    expect(clampSeekTime(150, 100)).toBe(100)
  })

  it('passes a value already in range through unchanged', () => {
    expect(clampSeekTime(50, 100)).toBe(50)
  })
})

describe('nextSpeed', () => {
  it('cycles forward through SPEEDS', () => {
    expect(nextSpeed(1)).toBe(1.5)
    expect(nextSpeed(1.5)).toBe(2)
  })

  it('wraps back to the first speed after the last', () => {
    expect(nextSpeed(SPEEDS[SPEEDS.length - 1])).toBe(SPEEDS[0])
  })
})
