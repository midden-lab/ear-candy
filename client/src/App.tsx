import { useEffect, useState } from 'react'
import { getSettings, getSeasons, getEpisodes } from './api'
import { useTheme } from './hooks/useTheme'
import { usePlayerStore } from './store/playerStore'
import type { Settings, Season, Episode } from './types'
import AppShell from './components/AppShell'
import ThemeBadge from './components/ThemeBadge'
import IconRail from './components/IconRail'
import EpisodeList from './components/EpisodeList'
import DetailPane from './components/DetailPane'
import AudioPlayer from './components/AudioPlayer'
import AdminLogin from './pages/AdminLogin'
import AdminLayout from './pages/admin/AdminLayout'
import EpisodeManager from './pages/admin/EpisodeManager'
import AdminSettings from './pages/admin/AdminSettings'

type View = 'player' | 'admin-login' | 'admin'
type AdminTab = 'episodes' | 'settings'

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [seasons, setSeasons] = useState<Season[]>([])
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [activeSeason, setActiveSeason] = useState<number | null>(null)
  const [view, setView] = useState<View>('player')
  const [adminTab, setAdminTab] = useState<AdminTab>('episodes')
  const episode = usePlayerStore(s => s.episode)

  const { isDark, toggleDark } = useTheme(settings?.accent_color ?? '#5a3ef5')

  useEffect(() => {
    void getSettings().then(setSettings).catch(console.error)
    void getSeasons().then(s => {
      setSeasons(s)
      if (s.length > 0) {
        setActiveSeason(s[0].id)
        void getEpisodes(s[0].id).then(setEpisodes).catch(console.error)
      }
    }).catch(console.error)
  }, [])

  const handleSeasonSelect = (seasonId: number) => {
    setActiveSeason(seasonId)
    void getEpisodes(seasonId).then(setEpisodes).catch(console.error)
  }

  if (settings === null) {
    return (
      <div className="flex h-screen items-center justify-center text-zinc-400">
        Loading…
      </div>
    )
  }

  if (view === 'admin-login') {
    return <AdminLogin onSuccess={() => setView('admin')} />
  }

  if (view === 'admin') {
    return (
      <AdminLayout onLogout={() => setView('player')}>
        <div className="mb-6 flex gap-3 border-b border-zinc-800 pb-3">
          <button
            onClick={() => setAdminTab('episodes')}
            className={`text-sm font-medium transition-colors ${adminTab === 'episodes' ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Episodes
          </button>
          <button
            onClick={() => setAdminTab('settings')}
            className={`text-sm font-medium transition-colors ${adminTab === 'settings' ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Settings
          </button>
        </div>
        {adminTab === 'episodes' ? <EpisodeManager /> : <AdminSettings />}
      </AdminLayout>
    )
  }

  return (
    <AppShell
      rail={<IconRail onAdminClick={async () => {
        try {
          const res = await fetch('/api/admin/session', { credentials: 'include' })
          if (res.ok) {
            const data = await res.json() as { authenticated: boolean }
            if (data.authenticated) {
              setView('admin')
              return
            }
          }
        } catch {
          // ignore — fall through to login
        }
        setView('admin-login')
      }} />}
      sidebar={
        <EpisodeList
          podcastName={settings.podcast_name}
          seasons={seasons}
          episodes={episodes}
          activeSeason={activeSeason}
          onSeasonSelect={handleSeasonSelect}
        />
      }
      detail={
        <>
          <DetailPane episode={episode} seasons={seasons} />
          <AudioPlayer />
        </>
      }
      themeBadge={<ThemeBadge isDark={isDark} onToggle={toggleDark} />}
    />
  )
}
