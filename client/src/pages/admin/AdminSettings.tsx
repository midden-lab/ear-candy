import { useState, useEffect } from 'react'
import { getSettings, updateSettings } from '../../api'

export default function AdminSettings() {
  const [podcastName, setPodcastName] = useState('')
  const [tagline, setTagline] = useState('')
  const [description, setDescription] = useState('')
  const [accentColor, setAccentColor] = useState('#000000')
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getSettings().then(s => {
      setPodcastName(s.podcast_name)
      setTagline(s.tagline)
      setDescription(s.description)
      setAccentColor(s.accent_color)
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setSaved(false)
    try {
      await updateSettings({ podcast_name: podcastName, tagline, description, accent_color: accentColor })
      setSaved(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <h2 className="text-xl font-bold">Settings</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="podcast_name" className="block text-sm text-zinc-400 mb-1">Podcast Name</label>
          <input id="podcast_name" type="text" value={podcastName}
            onChange={e => setPodcastName(e.target.value)}
            className="w-full rounded bg-zinc-800 px-3 py-2 text-zinc-100" />
        </div>
        <div>
          <label htmlFor="tagline" className="block text-sm text-zinc-400 mb-1">Tagline</label>
          <input id="tagline" type="text" value={tagline}
            onChange={e => setTagline(e.target.value)}
            className="w-full rounded bg-zinc-800 px-3 py-2 text-zinc-100" />
        </div>
        <div>
          <label htmlFor="description" className="block text-sm text-zinc-400 mb-1">Description</label>
          <textarea id="description" rows={4} value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full rounded bg-zinc-800 px-3 py-2 text-zinc-100" />
        </div>
        <div>
          <label htmlFor="accent_color" className="block text-sm text-zinc-400 mb-1">Accent Color</label>
          <input id="accent_color" type="color" value={accentColor}
            onChange={e => setAccentColor(e.target.value)}
            className="h-10 w-20 rounded bg-zinc-800 cursor-pointer" />
        </div>
        {saved && (
          <p role="status" className="text-sm text-green-400">Settings saved!</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-[var(--accent)] px-6 py-2 text-white font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  )
}
