import { useState, useEffect } from 'react'
import { getSettings, updateSettings, uploadFavicon } from '../../api'

export default function AdminSettings() {
  const [podcastName, setPodcastName] = useState('')
  const [browserTabTitle, setBrowserTabTitle] = useState('')
  const [tagline, setTagline] = useState('')
  const [description, setDescription] = useState('')
  const [accentColor, setAccentColor] = useState('#000000')
  const [faviconPath, setFaviconPath] = useState<string | null>(null)
  const [faviconUploading, setFaviconUploading] = useState(false)
  const [faviconUploadError, setFaviconUploadError] = useState('')
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getSettings().then(s => {
      setPodcastName(s.podcast_name)
      setBrowserTabTitle(s.browser_tab_title ?? '')
      setTagline(s.tagline)
      setDescription(s.description)
      setAccentColor(s.accent_color)
      setFaviconPath(s.favicon_path)
    })
  }, [])

  async function handleFaviconChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFaviconUploading(true)
    setFaviconUploadError('')
    try {
      const result = await uploadFavicon(file)
      setFaviconPath(result.path)
    } catch (err) {
      setFaviconUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setFaviconUploading(false)
    }
  }

  function handleRemoveFavicon() {
    setFaviconPath(null)
    setFaviconUploadError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setSaved(false)
    try {
      await updateSettings({
        podcast_name: podcastName,
        browser_tab_title: browserTabTitle.trim() === '' ? null : browserTabTitle,
        tagline,
        description,
        accent_color: accentColor,
        favicon_path: faviconPath,
      })
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
          <label htmlFor="podcast_name" className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1">Podcast Name</label>
          <input id="podcast_name" type="text" value={podcastName}
            onChange={e => setPodcastName(e.target.value)}
            className="w-full rounded bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-zinc-100" />
        </div>
        <div className="ml-4 border-l border-zinc-200 dark:border-zinc-800 pl-4">
          <label htmlFor="browser_tab_title" className="block text-xs font-normal text-zinc-400 dark:text-zinc-500 mb-1">Browser Tab Title</label>
          <input id="browser_tab_title" type="text" value={browserTabTitle}
            onChange={e => setBrowserTabTitle(e.target.value)}
            placeholder={podcastName || 'Defaults to Podcast Name'}
            className="w-full rounded bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-zinc-100" />
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
            Shown in the browser tab. Defaults to your Podcast Name — set this only if you want something shorter or different (e.g. a business name instead of the podcast title). Keep it short — tabs truncate long titles.
          </p>
        </div>
        <div>
          <label htmlFor="tagline" className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1">Tagline</label>
          <input id="tagline" type="text" value={tagline}
            onChange={e => setTagline(e.target.value)}
            className="w-full rounded bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-zinc-100" />
        </div>
        <div>
          <label htmlFor="description" className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1">Description</label>
          <textarea id="description" rows={4} value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full rounded bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-zinc-100" />
        </div>
        <div>
          <label htmlFor="accent_color" className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1">Accent Color</label>
          <input id="accent_color" type="color" value={accentColor}
            onChange={e => setAccentColor(e.target.value)}
            className="h-10 w-20 rounded bg-zinc-100 dark:bg-zinc-800 cursor-pointer" />
        </div>
        <div>
          <label className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1" htmlFor="favicon">Favicon</label>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
              {faviconPath && (
                <img src={faviconPath} alt="Favicon preview" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <input id="favicon" type="file" accept="image/png,image/x-icon,image/vnd.microsoft.icon,.ico" onChange={e => void handleFaviconChange(e)}
                className="w-full rounded bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-zinc-100" />
              {faviconUploading && <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Uploading...</p>}
              {faviconUploadError && <p className="text-sm text-red-600 dark:text-red-400 mt-1">{faviconUploadError}</p>}
              {faviconPath && !faviconUploading && (
                <button type="button" onClick={handleRemoveFavicon} className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 mt-1">
                  Remove favicon
                </button>
              )}
            </div>
          </div>
        </div>
        {saved && (
          <p role="status" className="text-sm text-green-600 dark:text-green-400">Settings saved!</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-[var(--accent)] px-6 py-2 text-[var(--accent-contrast)] font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  )
}
