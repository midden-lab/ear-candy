import { useEffect, useRef, useState } from 'react'
import { getSettings, getSeasons, getEpisodes, getEpisode, logout } from './api'
import { useTheme } from './hooks/useTheme'
import { usePlayerStore } from './store/playerStore'
import { trackPageView } from './utils/analytics'
import type { Settings, Season, Episode } from './types'
import AppShell from './components/AppShell'
import ThemeBadge from './components/ThemeBadge'
import IconRail from './components/IconRail'
import MobileTabBar from './components/MobileTabBar'
import MobileSettingsView from './components/MobileSettingsView'
import EpisodeList from './components/EpisodeList'
import DetailPane from './components/DetailPane'
import AudioPlayer from './components/AudioPlayer'
import type { SharedStart } from './components/AudioPlayer'
import AdminLogin from './pages/AdminLogin'
import AdminLayout from './pages/admin/AdminLayout'
import EpisodeManager from './pages/admin/EpisodeManager'
import AdminSettings from './pages/admin/AdminSettings'
import AdminAnalytics from './pages/admin/AdminAnalytics'

type View = 'player' | 'admin-login' | 'admin'
type AdminTab = 'episodes' | 'settings' | 'analytics'

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [seasons, setSeasons] = useState<Season[]>([])
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [activeSeason, setActiveSeason] = useState<number | null>(null)
  const [episodesLoading, setEpisodesLoading] = useState(false)
  const [view, setView] = useState<View>('player')
  const [adminTab, setAdminTab] = useState<AdminTab>('episodes')
  // Which pane is focused on mobile. Set unconditionally on episode
  // selection (not gated by device class) so a desktop window resized down
  // to phone width behaves identically to an actual phone — AppShell only
  // gives this visual effect below the `md` breakpoint.
  const [focusedPane, setFocusedPane] = useState<'list' | 'detail' | 'settings'>('list')
  // Bumped to command AudioPlayerView's full-screen "now playing" overlay to
  // open, from MobileTabBar's "Now Playing" tab — mirrors the retrySignal
  // pattern already used for the same reason (only AudioPlayerView owns its
  // own expand/collapse state).
  const [expandSignal, setExpandSignal] = useState(0)
  // The episode shown in the detail pane — deliberately independent of the
  // player's own episode/playing state. Browsing the list must never
  // interrupt whatever's already playing in the background; only an
  // explicit Play action (DetailPane's play button, or the player bar
  // itself once something is loaded) is allowed to change what's loaded
  // into the player.
  const [viewingEpisode, setViewingEpisode] = useState<Episode | null>(null)
  const playerEpisode = usePlayerStore(s => s.episode)
  const playing = usePlayerStore(s => s.playing)
  const playerLoading = usePlayerStore(s => s.loading)
  const playerError = usePlayerStore(s => s.error)
  const [sharedStart, setSharedStart] = useState<SharedStart | undefined>(undefined)
  // Guards trackPageView() to fire exactly once per app load — the effect
  // below also re-runs whenever `settings` changes for unrelated reasons
  // (e.g. an admin editing settings), and React 19 StrictMode double-invokes
  // effects in dev.
  const pageViewSentRef = useRef(false)

  const { isDark, toggleDark } = useTheme(settings?.accent_color ?? '#5a3ef5')

  useEffect(() => {
    void getSettings().then(setSettings).catch(console.error)

    // A shared episode link looks like `?episode=123&t=754` (see
    // utils/shareUrl.ts). `t` is only meaningful alongside a valid
    // `episode` id, and both are parsed once at boot — this app has no
    // client-side router, so the URL is only ever read here, not watched.
    const params = new URLSearchParams(window.location.search)
    const sharedEpisodeId = parseInt(params.get('episode') ?? '', 10)
    const sharedTime = parseInt(params.get('t') ?? '', 10)

    void getSeasons().then(async s => {
      setSeasons(s)
      if (s.length === 0) return

      if (!isNaN(sharedEpisodeId)) {
        try {
          const ep = await getEpisode(sharedEpisodeId)
          // Deep links load the episode ready-to-play but paused (same
          // no-autoplay rule as browsing the list) — the listener still has
          // to press Play themselves.
          usePlayerStore.getState().setEpisode(ep)
          usePlayerStore.getState().setPlaying(false)
          setViewingEpisode(ep)
          setFocusedPane('detail')
          if (!isNaN(sharedTime) && sharedTime >= 0) {
            setSharedStart({ episodeId: ep.id, time: sharedTime })
          }
          setActiveSeason(ep.season_id)
          setEpisodesLoading(true)
          await getEpisodes(ep.season_id).then(setEpisodes).catch(console.error)
          setEpisodesLoading(false)
          return
        } catch {
          // Invalid, hidden, or deleted episode in the shared link — fall
          // through to the normal default-season view below, same as a
          // plain visit with no query params.
        }
      }

      setActiveSeason(s[0].id)
      setEpisodesLoading(true)
      void getEpisodes(s[0].id).then(setEpisodes).catch(console.error).finally(() => setEpisodesLoading(false))
    }).catch(console.error)
  }, [])

  useEffect(() => {
    if (!settings) return

    if (!pageViewSentRef.current) {
      pageViewSentRef.current = true
      trackPageView()
    }

    document.title = settings.browser_tab_title || settings.podcast_name

    const existingLinks = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')
    if (settings.favicon_path) {
      // Collapse to a single tag even if more than one somehow ended up in
      // the document, so stale tags never linger alongside the current one.
      const [link, ...extras] = existingLinks.length > 0
        ? Array.from(existingLinks)
        : [document.createElement('link')]
      extras.forEach(el => el.remove())
      link.rel = 'icon'
      link.href = settings.favicon_path
      if (!link.isConnected) document.head.appendChild(link)
    } else {
      // No favicon configured — remove any previously-injected tag(s) so the
      // browser falls back to its own default rather than keeping a stale one.
      existingLinks.forEach(el => el.remove())
    }
  }, [settings])

  // The only place playback is ever started/switched from browsing UI —
  // toggles play/pause if the viewed episode is already the one loaded in
  // the player, otherwise loads it fresh and starts it (interrupting
  // whatever was playing before, same as any podcast app: only one thing
  // can audibly play at a time, but *browsing* never does this on its own).
  const handlePlayEpisode = (ep: Episode) => {
    const store = usePlayerStore.getState()
    if (store.episode?.id === ep.id) {
      store.setPlaying(!store.playing)
    } else {
      store.setEpisode(ep)
      store.setPlaying(true)
    }
  }

  const handleSeasonSelect = (seasonId: number) => {
    setActiveSeason(seasonId)
    setEpisodesLoading(true)
    void getEpisodes(seasonId).then(setEpisodes).catch(console.error).finally(() => setEpisodesLoading(false))
  }

  const handleAdminClick = async () => {
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
  }

  const handleLogout = async () => {
    try {
      await logout()
    } catch {
      // ignore — fall through to clearing local view state regardless
    }
    setView('player')
  }

  if (settings === null) {
    return (
      <div className="flex h-screen items-center justify-center text-zinc-500 dark:text-zinc-400">
        Loading…
      </div>
    )
  }

  if (view === 'admin-login') {
    return <AdminLogin onSuccess={() => setView('admin')} />
  }

  if (view === 'admin') {
    return (
      <AdminLayout onLogout={() => void handleLogout()} onUnauthorized={() => setView('admin-login')}>
        <div className="mb-6 flex gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-3">
          <button
            onClick={() => setAdminTab('episodes')}
            className={`text-sm font-medium transition-colors ${adminTab === 'episodes' ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'}`}
          >
            Episodes
          </button>
          <button
            onClick={() => setAdminTab('settings')}
            className={`text-sm font-medium transition-colors ${adminTab === 'settings' ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'}`}
          >
            Settings
          </button>
          <button
            onClick={() => setAdminTab('analytics')}
            className={`text-sm font-medium transition-colors ${adminTab === 'analytics' ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'}`}
          >
            Analytics
          </button>
        </div>
        {adminTab === 'episodes' ? <EpisodeManager /> : adminTab === 'settings' ? <AdminSettings /> : <AdminAnalytics />}
      </AdminLayout>
    )
  }

  const themeBadge = <ThemeBadge isDark={isDark} onToggle={toggleDark} />

  return (
    <AppShell
      focusedPane={focusedPane}
      rail={<IconRail onAdminClick={() => void handleAdminClick()} />}
      sidebar={
        <EpisodeList
          podcastName={settings.podcast_name}
          seasons={seasons}
          episodes={episodes}
          activeSeason={activeSeason}
          analyticsEnabled={settings.analytics_enabled}
          loading={episodesLoading}
          viewingEpisodeId={viewingEpisode?.id ?? null}
          onSeasonSelect={handleSeasonSelect}
          onEpisodeView={ep => setViewingEpisode(ep)}
          onEpisodeSelect={() => setFocusedPane('detail')}
        />
      }
      detail={
        <DetailPane
          episode={viewingEpisode}
          seasons={seasons}
          isCurrentPlayerEpisode={playerEpisode?.id === viewingEpisode?.id}
          playing={playing}
          loading={playerLoading}
          error={playerError}
          onPlayPause={() => viewingEpisode && handlePlayEpisode(viewingEpisode)}
          onRetry={() => usePlayerStore.getState().retryPlayback()}
          onBack={() => setFocusedPane('list')}
        />
      }
      settings={
        <MobileSettingsView
          onAdminClick={() => void handleAdminClick()}
          themeBadge={themeBadge}
        />
      }
      tabBar={
        <MobileTabBar
          activeTab={focusedPane === 'settings' ? 'settings' : 'episodes'}
          hasPlayerEpisode={playerEpisode !== null}
          onSelectEpisodes={() => setFocusedPane('list')}
          onSelectSettings={() => setFocusedPane('settings')}
          onExpandPlayer={() => setExpandSignal(n => n + 1)}
        />
      }
      player={<AudioPlayer sharedStart={sharedStart} expandSignal={expandSignal} />}
      themeBadge={themeBadge}
    />
  )
}
