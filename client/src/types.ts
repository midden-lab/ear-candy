export interface Settings {
  podcast_name: string
  tagline: string
  description: string
  cover_art_path: string | null
  favicon_path: string | null
  browser_tab_title: string | null
  accent_color: string
  analytics_enabled: boolean
  track_returning_listeners: boolean
}

export type AnalyticsEventType = 'page_view' | 'play_start' | 'listen_progress' | 'play_complete'

export interface AnalyticsOverview {
  totalPageViews: number
  totalPlayStarts: number
  totalPlayCompletes: number
  uniqueSessions: number
  newSessions: number
  returningSessions: number
  timeseries: { date: string; page_views: number; play_starts: number }[]
}

export interface AnalyticsEpisodeStat {
  episode_id: number
  title: string
  play_starts: number
  play_completes: number
  completion_rate: number
  milestone_25: number
  milestone_50: number
  milestone_75: number
  milestone_90: number
}

export interface AnalyticsBreakdowns {
  countries: { key: string; count: number }[]
  devices: { key: string; count: number }[]
  browsers: { key: string; count: number }[]
  os: { key: string; count: number }[]
  referrers: { key: string; count: number }[]
}

export interface Season {
  id: number
  number: number
  title: string
  description: string
  cover_art_path: string | null
  hidden: boolean
  created_at: string
}

export interface Episode {
  id: number
  season_id: number
  number: number
  title: string
  description: string
  guests: string
  tags: string
  cover_art_path: string | null
  cover_art_thumb_path: string | null
  duration_seconds: number
  publish_date: string
  audio_type: 'upload' | 'url'
  audio_path: string
  hidden: boolean
  created_at: string
  updated_at: string
}
