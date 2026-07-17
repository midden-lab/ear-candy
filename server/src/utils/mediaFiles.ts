import { promises as fs } from 'node:fs'
import path from 'node:path'

// Matches server/src/app.ts's own resolution of these two static-serving
// roots exactly — kept as functions (not top-level consts) so tests can
// process.chdir() into a tmp dir before calling, the same convention
// already used in uploads-dir.test.ts.
function uploadsDir(): string {
  return path.resolve('data/uploads')
}
function imagesDir(): string {
  return path.resolve('data/uploads/images')
}

/**
 * Deletes a locally-uploaded media file referenced by a stored path like
 * "/audio/<uuid>.mp3" or "/images/<uuid>-detail.webp" — a no-op for
 * external http(s) URLs, null/undefined, or anything not matching one of
 * the two known local prefixes. Tolerant of the file already being gone.
 *
 * Without this, deleting an episode or season leaves its uploaded audio/
 * cover-art files behind in data/uploads/ forever — orphaned disk usage
 * with no cleanup path (issue #4).
 */
export async function deleteLocalMediaFile(mediaPath: string | null | undefined): Promise<void> {
  if (!mediaPath) return

  let root: string
  let relative: string
  if (mediaPath.startsWith('/audio/')) {
    root = uploadsDir()
    relative = mediaPath.slice('/audio/'.length)
  } else if (mediaPath.startsWith('/images/')) {
    root = imagesDir()
    relative = mediaPath.slice('/images/'.length)
  } else {
    return
  }

  const resolved = path.join(root, relative)
  // Defense in depth: never unlink outside the expected root, even though
  // isValidMediaPath already rejects traversal-shaped values before a path
  // ever reaches the database (see utils/validation.ts, issue #39).
  if (!resolved.startsWith(root + path.sep)) return

  try {
    await fs.unlink(resolved)
  } catch (err) {
    // Best-effort cleanup: the DB row is already gone regardless of
    // whether the file happened to be missing (ENOENT) or failed to
    // delete for some other reason — never let this fail the API response.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      // Swallow — nothing meaningful to do with a stray unlink failure here.
    }
  }
}
