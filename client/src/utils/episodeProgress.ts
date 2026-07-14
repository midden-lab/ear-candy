// Per-episode playback position, cached client-side so switching away from
// an episode and back later resumes where the listener left off. Keyed by
// episode id in a single localStorage entry (not one key per episode) so
// cleanup/eviction is simple to reason about.

const STORAGE_KEY = 'episode-progress'
const MAX_ENTRIES = 50
const MIN_SECONDS_TO_PERSIST = 5

interface ProgressEntry {
  time: number
  savedAt: number
}

type ProgressMap = Record<number, ProgressEntry>

function readMap(): ProgressMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ProgressMap) : {}
  } catch {
    return {}
  }
}

function writeMap(map: ProgressMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Quota exceeded, private browsing, etc. — resume position is a
    // nice-to-have and never worth failing playback over.
  }
}

export function getEpisodeProgress(episodeId: number): number | undefined {
  return readMap()[episodeId]?.time
}

export function saveEpisodeProgress(episodeId: number, time: number): void {
  // Don't bother remembering a position that's barely past the start —
  // resuming "3 seconds in" isn't meaningfully different from starting over.
  if (time < MIN_SECONDS_TO_PERSIST) {
    clearEpisodeProgress(episodeId)
    return
  }
  const map = readMap()
  map[episodeId] = { time, savedAt: Date.now() }

  const entries = Object.entries(map)
  if (entries.length > MAX_ENTRIES) {
    entries
      .sort((a, b) => a[1].savedAt - b[1].savedAt)
      .slice(0, entries.length - MAX_ENTRIES)
      .forEach(([id]) => delete map[Number(id)])
  }
  writeMap(map)
}

export function clearEpisodeProgress(episodeId: number): void {
  const map = readMap()
  delete map[episodeId]
  writeMap(map)
}
