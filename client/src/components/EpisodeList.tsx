import type { Season, Episode } from '../types'
import { usePlayerStore } from '../store/playerStore'
import SeasonTabs from './SeasonTabs'
import EpisodeItem from './EpisodeItem'

interface EpisodeListProps {
  podcastName: string
  seasons: Season[]
  episodes: Episode[]
  activeSeason: number | null
  onSeasonSelect: (seasonId: number) => void
}

export default function EpisodeList({ podcastName, seasons, episodes, activeSeason, onSeasonSelect }: EpisodeListProps) {
  const currentEpisode = usePlayerStore(state => state.episode)
  const setEpisode = usePlayerStore(state => state.setEpisode)
  const setPlaying = usePlayerStore(state => state.setPlaying)

  function handleEpisodeClick(ep: Episode) {
    setEpisode(ep)
    setPlaying(true)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-100 truncate">{podcastName}</h2>
      </div>
      <SeasonTabs seasons={seasons} activeSeason={activeSeason} onSelect={onSeasonSelect} />
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {episodes.map(ep => (
          <EpisodeItem
            key={ep.id}
            episode={ep}
            isActive={currentEpisode?.id === ep.id}
            onClick={handleEpisodeClick}
          />
        ))}
      </div>
    </div>
  )
}
