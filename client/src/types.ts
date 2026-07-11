export interface Settings {
  podcast_name: string
  tagline: string
  description: string
  cover_art_path: string | null
  accent_color: string
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
