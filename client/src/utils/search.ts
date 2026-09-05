import type { Episode } from '../types'

export interface SearchResult {
  episode: Episode
  seasonId: number
}

/** True if `query` (any case, untrimmed — normalized internally) appears in
 *  the episode's title or its comma-separated guest list. A blank/
 *  whitespace-only query matches nothing, rather than matching everything. */
export function matchesEpisodeQuery(episode: Episode, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  if (episode.title.toLowerCase().includes(q)) return true
  if (!episode.guests) return false
  return episode.guests
    .split(',')
    .map(g => g.trim().toLowerCase())
    .some(g => g.includes(q))
}

/** Flattens `episodes` across all seasons and returns every match for
 *  `query`, each tagged with its origin season id for an inline "S9"-style
 *  label. Empty/whitespace-only query returns an empty array (the caller
 *  is expected to fall back to season-scoped browsing in that case, not
 *  call this at all) — falls out naturally from matchesEpisodeQuery's own
 *  blank-query handling, no separate check needed here. */
export function searchAllEpisodes(episodes: Episode[], query: string): SearchResult[] {
  return episodes
    .filter(episode => matchesEpisodeQuery(episode, query))
    .map(episode => ({ episode, seasonId: episode.season_id }))
}
