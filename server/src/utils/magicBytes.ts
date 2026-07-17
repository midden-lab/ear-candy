import { Readable } from 'node:stream'

// How many leading bytes we need buffered to check every signature below.
// ISOBMFF (m4a) needs the 'ftyp' box type at offset 4-7, so 12 covers all cases.
const HEADER_PEEK_BYTES = 12

/**
 * Consumes just enough of `stream` to inspect its leading bytes, then
 * returns a new stream that replays those bytes followed by the rest of
 * the original stream — so the caller can validate content before ever
 * writing anything to disk, without buffering the whole upload in memory
 * (issue #38).
 */
export async function peekHeader(
  stream: NodeJS.ReadableStream,
  n: number = HEADER_PEEK_BYTES
): Promise<{ head: Buffer; stream: Readable }> {
  const iterator = (stream as AsyncIterable<Buffer>)[Symbol.asyncIterator]()
  const chunks: Buffer[] = []
  let total = 0
  while (total < n) {
    const { value, done } = await iterator.next()
    if (done) break
    chunks.push(value)
    total += value.length
  }
  const head = Buffer.concat(chunks)

  async function* replay() {
    yield head
    while (true) {
      const { value, done } = await iterator.next()
      if (done) return
      yield value
    }
  }

  return { head, stream: Readable.from(replay()) }
}

function isMp3(head: Buffer): boolean {
  if (head.length >= 3 && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) return true // "ID3"
  // MPEG frame sync: 11 set bits, tolerant of any MPEG version/layer combination.
  return head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0
}

function isWav(head: Buffer): boolean {
  return (
    head.length >= 12 &&
    head.subarray(0, 4).toString('ascii') === 'RIFF' &&
    head.subarray(8, 12).toString('ascii') === 'WAVE'
  )
}

function isOgg(head: Buffer): boolean {
  return head.length >= 4 && head.subarray(0, 4).toString('ascii') === 'OggS'
}

function isFlac(head: Buffer): boolean {
  return head.length >= 4 && head.subarray(0, 4).toString('ascii') === 'fLaC'
}

function isAac(head: Buffer): boolean {
  // ADTS sync word (12 set bits) — the only widely-used raw .aac framing.
  return head.length >= 2 && head[0] === 0xff && (head[1] & 0xf0) === 0xf0
}

function isIsoBmff(head: Buffer): boolean {
  // Covers .m4a and .webm's occasional ISOBMFF-shaped variants; box type at offset 4-7 is "ftyp".
  return head.length >= 8 && head.subarray(4, 8).toString('ascii') === 'ftyp'
}

function isWebm(head: Buffer): boolean {
  // EBML magic number, the container format Matroska/WebM both use.
  return head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3
}

const AUDIO_SIGNATURE_CHECKS: Record<string, (head: Buffer) => boolean> = {
  '.mp3': isMp3,
  '.wav': isWav,
  '.ogg': isOgg,
  '.oga': isOgg,
  '.flac': isFlac,
  '.aac': isAac,
  '.m4a': isIsoBmff,
  '.webm': isWebm,
}

export function matchesAudioSignature(head: Buffer, ext: string): boolean {
  const check = AUDIO_SIGNATURE_CHECKS[ext]
  return check ? check(head) : false
}

function isPng(head: Buffer): boolean {
  const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return head.length >= PNG_MAGIC.length && head.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)
}

function isIco(head: Buffer): boolean {
  return head.length >= 4 && head[0] === 0x00 && head[1] === 0x00 && head[2] === 0x01 && head[3] === 0x00
}

const FAVICON_SIGNATURE_CHECKS: Record<string, (head: Buffer) => boolean> = {
  '.png': isPng,
  '.ico': isIco,
}

export function matchesFaviconSignature(head: Buffer, ext: string): boolean {
  const check = FAVICON_SIGNATURE_CHECKS[ext]
  return check ? check(head) : false
}
