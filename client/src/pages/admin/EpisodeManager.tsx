import { useEffect, useState } from 'react'
import type { Season, Episode } from '../../types'
import {
  getSeasons,
  getEpisodes,
  createSeason,
  deleteSeason,
  deleteEpisode,
} from '../../api'
import SeasonBlock from './SeasonBlock'
import EpisodeFormPanel from './EpisodeFormPanel'

interface FormPanel {
  type: 'new' | 'edit'
  seasonId: number
  episode?: Episode
}

export default function EpisodeManager() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [formPanel, setFormPanel] = useState<FormPanel | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchSeasons() {
    const data = await getSeasons()
    setSeasons(data)
  }

  async function fetchEpisodes() {
    const data = await getEpisodes()
    setEpisodes(data)
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([getSeasons(), getEpisodes()]).then(([s, e]) => {
      if (!cancelled) {
        setSeasons(s)
        setEpisodes(e)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [])

  async function handleNewSeason() {
    await createSeason({ number: seasons.length + 1, title: `Season ${seasons.length + 1}` })
    await fetchSeasons()
  }

  function handleEditSeason(season: Season) {
    // Season editing not yet implemented in this panel
    console.log('Edit season', season)
  }

  async function handleDeleteSeason(id: number) {
    await deleteSeason(id)
    await fetchSeasons()
  }

  function handleNewEpisode(seasonId: number) {
    setFormPanel({ type: 'new', seasonId })
  }

  function handleEditEpisode(episode: Episode) {
    setFormPanel({ type: 'edit', seasonId: episode.season_id, episode })
  }

  async function handleDeleteEpisode(id: number) {
    await deleteEpisode(id)
    await fetchEpisodes()
  }

  async function handleFormSave(_ep: Episode) {
    setFormPanel(null)
    await fetchEpisodes()
  }

  if (loading) {
    return <div>Loading…</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Episodes</h2>
        <button onClick={handleNewSeason} className="rounded bg-[var(--accent)] px-4 py-2 text-sm text-white hover:opacity-90">
          + New Season
        </button>
      </div>
      {seasons.map(season => (
        <SeasonBlock
          key={season.id}
          season={season}
          episodes={episodes.filter(e => e.season_id === season.id)}
          onEditSeason={handleEditSeason}
          onDeleteSeason={handleDeleteSeason}
          onNewEpisode={handleNewEpisode}
          onEditEpisode={handleEditEpisode}
          onDeleteEpisode={handleDeleteEpisode}
        />
      ))}
      {formPanel && (
        <EpisodeFormPanel
          seasonId={formPanel.seasonId}
          episode={formPanel.episode}
          onSave={handleFormSave}
          onCancel={() => setFormPanel(null)}
        />
      )}
    </div>
  )
}
