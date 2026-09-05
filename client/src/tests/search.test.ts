import { matchesEpisodeQuery, searchAllEpisodes } from '../utils/search'
import type { Episode } from '../types'

function makeEpisode(overrides: Partial<Episode>): Episode {
  return {
    id: 1,
    season_id: 1,
    number: 1,
    title: 'Untitled',
    description: '',
    guests: '',
    tags: '',
    cover_art_path: null,
    cover_art_thumb_path: null,
    duration_seconds: 1200,
    publish_date: '2024-01-01',
    audio_type: 'upload',
    audio_path: '/audio/ep.mp3',
    hidden: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('matchesEpisodeQuery', () => {
  it('matches on title, case-insensitively', () => {
    const ep = makeEpisode({ title: 'The Orgasm Gap, Explained' })
    expect(matchesEpisodeQuery(ep, 'orgasm gap')).toBe(true)
    expect(matchesEpisodeQuery(ep, 'ORGASM')).toBe(true)
  })

  it('matches on a guest name within a comma-separated list, case-insensitively', () => {
    const ep = makeEpisode({ title: 'Season Premiere', guests: 'Erin, Dr. Priya Nair' })
    expect(matchesEpisodeQuery(ep, 'priya')).toBe(true)
    expect(matchesEpisodeQuery(ep, 'ERIN')).toBe(true)
  })

  it('does not match unrelated text', () => {
    const ep = makeEpisode({ title: 'Consent 101', guests: 'Erin' })
    expect(matchesEpisodeQuery(ep, 'menstrual cycle')).toBe(false)
  })

  it('does not throw and returns false when guests is an empty string', () => {
    const ep = makeEpisode({ title: 'Solo Episode', guests: '' })
    expect(matchesEpisodeQuery(ep, 'anyone')).toBe(false)
  })

  it('a blank or whitespace-only query matches nothing, not everything', () => {
    const ep = makeEpisode({ title: 'Anything Goes' })
    expect(matchesEpisodeQuery(ep, '')).toBe(false)
    expect(matchesEpisodeQuery(ep, '   ')).toBe(false)
  })
})

describe('searchAllEpisodes', () => {
  const episodes = [
    makeEpisode({ id: 1, season_id: 1, title: 'Welcome to the Show', guests: 'Erin' }),
    makeEpisode({ id: 2, season_id: 1, title: 'Boundaries and Consent', guests: 'Erin' }),
    makeEpisode({ id: 3, season_id: 2, title: 'Season Premiere', guests: 'Dr. Priya Nair' }),
    makeEpisode({ id: 4, season_id: 9, title: 'The Orgasm Gap, Explained', guests: 'Erin' }),
  ]

  it('flattens matches across every season and tags each with its origin season id', () => {
    const results = searchAllEpisodes(episodes, 'erin')
    expect(results.map(r => r.episode.id).sort()).toEqual([1, 2, 4])
    const seasonNine = results.find(r => r.episode.id === 4)
    expect(seasonNine?.seasonId).toBe(9)
  })

  it('matches case-insensitively regardless of title casing', () => {
    const results = searchAllEpisodes(episodes, 'ORGASM')
    expect(results).toHaveLength(1)
    expect(results[0].episode.id).toBe(4)
  })

  it('returns an empty array for an empty query', () => {
    expect(searchAllEpisodes(episodes, '')).toEqual([])
  })

  it('returns an empty array for a whitespace-only query', () => {
    expect(searchAllEpisodes(episodes, '   ')).toEqual([])
  })

  it('returns an empty array when nothing matches', () => {
    expect(searchAllEpisodes(episodes, 'nonexistent guest or title')).toEqual([])
  })
})
