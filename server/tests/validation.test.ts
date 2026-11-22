import { describe, it, expect } from 'vitest'
import { isValidMediaPath, isNonEmptyString, isStringWithin, isIntegerInRange, isHexColor, firstInvalid } from '../src/utils/validation.js'

describe('isValidMediaPath', () => {
  it('accepts real upload-shaped local audio paths', () => {
    expect(isValidMediaPath('/audio/550e8400-e29b-41d4-a716-446655440000.mp3')).toBe(true)
    expect(isValidMediaPath('/audio/abc123.wav')).toBe(true)
  })

  it('accepts real upload-shaped local image paths (cover art + favicon)', () => {
    expect(isValidMediaPath('/images/550e8400-e29b-41d4-a716-446655440000-detail.webp')).toBe(true)
    expect(isValidMediaPath('/images/550e8400-e29b-41d4-a716-446655440000-thumb.webp')).toBe(true)
    expect(isValidMediaPath('/images/favicon-abc123.png')).toBe(true)
    expect(isValidMediaPath('/images/favicon-abc123.ico')).toBe(true)
  })

  it('accepts absolute http(s) URLs', () => {
    expect(isValidMediaPath('https://example.com/episode.mp3')).toBe(true)
    expect(isValidMediaPath('http://example.com/cover.jpg')).toBe(true)
  })

  it('rejects path traversal attempts', () => {
    expect(isValidMediaPath('/audio/../../../etc/passwd')).toBe(false)
    expect(isValidMediaPath('/audio/..%2F..%2Fetc%2Fpasswd')).toBe(false)
    expect(isValidMediaPath('/images/../../server/src/app.ts')).toBe(false)
    expect(isValidMediaPath('/audio/..')).toBe(false)
  })

  it('rejects extra path segments beyond a single filename', () => {
    expect(isValidMediaPath('/audio/sub/dir/file.mp3')).toBe(false)
    expect(isValidMediaPath('/audio//file.mp3')).toBe(false)
  })

  it('rejects a filename with no extension', () => {
    expect(isValidMediaPath('/audio/noextension')).toBe(false)
  })

  it('rejects a filename starting with a dot', () => {
    expect(isValidMediaPath('/audio/.hidden.mp3')).toBe(false)
  })

  it('rejects embedded null bytes and other control/whitespace characters', () => {
    expect(isValidMediaPath('/audio/file\x00.mp3')).toBe(false)
    expect(isValidMediaPath('/audio/file name.mp3')).toBe(false)
    expect(isValidMediaPath('/audio/file\n.mp3')).toBe(false)
  })

  it('rejects dangerous URL schemes', () => {
    expect(isValidMediaPath('javascript:alert(1)')).toBe(false)
    expect(isValidMediaPath('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isValidMediaPath('file:///etc/passwd')).toBe(false)
  })

  it('rejects a bare relative path with no scheme and no known local prefix', () => {
    expect(isValidMediaPath('not-a-path')).toBe(false)
    expect(isValidMediaPath('/uploads/file.mp3')).toBe(false)
  })
})

describe('isNonEmptyString', () => {
  it('accepts a non-blank string within the max length', () => {
    expect(isNonEmptyString('Season One', 300)).toBe(true)
    expect(isNonEmptyString('x'.repeat(300), 300)).toBe(true)
  })
  it('rejects non-strings, blank/whitespace-only strings and strings over the max', () => {
    for (const v of [undefined, null, 5, {}, ['a'], '', '   ', 'x'.repeat(301)]) {
      expect(isNonEmptyString(v, 300), String(v)).toBe(false)
    }
  })
})

describe('isStringWithin', () => {
  it('accepts any string (including empty) within the max, rejects everything else', () => {
    expect(isStringWithin('', 10)).toBe(true)
    expect(isStringWithin('abc', 3)).toBe(true)
    for (const v of [undefined, null, 5, {}, 'abcd']) expect(isStringWithin(v, 3), String(v)).toBe(false)
  })
})

describe('isIntegerInRange', () => {
  it('accepts integers within the inclusive range', () => {
    expect(isIntegerInRange(0, 0, 1_000_000)).toBe(true)
    expect(isIntegerInRange(1_000_000, 0, 1_000_000)).toBe(true)
    expect(isIntegerInRange(32, 0, 1_000_000)).toBe(true)
  })
  it('rejects non-numbers, numeric strings, non-integers, NaN/Infinity and out-of-range values', () => {
    for (const v of ['1', 'x', null, undefined, {}, [], 1.5, NaN, Infinity, -1, 1_000_001]) {
      expect(isIntegerInRange(v, 0, 1_000_000), String(v)).toBe(false)
    }
  })
})

describe('isHexColor', () => {
  it('accepts #rrggbb in either case', () => {
    for (const v of ['#5a3ef5', '#9437FF', '#000000', '#ffffff']) expect(isHexColor(v), v).toBe(true)
  })
  it('rejects shorthand, names, injection attempts and non-strings', () => {
    for (const v of ['#fff', '5a3ef5', 'red', 'red;}body{x', '#5a3ef5;', '#5a3ef5 ', '#gggggg', '', null, undefined, 123]) {
      expect(isHexColor(v), String(v)).toBe(false)
    }
  })
})

describe('firstInvalid', () => {
  it('returns the first failing field name, or null when all pass', () => {
    expect(firstInvalid([['a', true], ['b', false], ['c', false]])).toBe('b')
    expect(firstInvalid([['a', true]])).toBeNull()
    expect(firstInvalid([])).toBeNull()
  })
})
