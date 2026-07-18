import { useState } from 'react'
import type { Episode } from '../../types'
import { createEpisode, updateEpisode, uploadAudio, uploadEpisodeArt } from '../../api'

interface EpisodeFormPanelProps {
  seasonId: number
  episode?: Episode
  onSave: (ep: Episode) => void
  onCancel: () => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Reads real audio duration from the browser's own media metadata, so the
 * episode list (which displays the stored duration_seconds column) matches
 * what the player shows (which reads live from the <audio> element) without
 * requiring an admin to measure and type it in by hand. Resolves 0 on any
 * failure (unreadable format, CORS-blocked remote URL, etc.) rather than
 * rejecting, so a failed probe never blocks saving the episode.
 *
 * Listens for both loadedmetadata and durationchange: for MP3s without a
 * proper duration header, Chrome reports `duration: Infinity` on
 * loadedmetadata and only resolves the real value afterward via a
 * durationchange event once it finishes estimating.
 */
function probeAudioDuration(src: string, timeoutMs = 8000): Promise<number> {
  return new Promise(resolve => {
    const audio = new Audio()
    let settled = false

    const finish = (seconds: number) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(seconds)
    }
    const checkDuration = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        finish(Math.round(audio.duration))
      }
    }
    const onError = () => finish(0)
    const timeoutId = setTimeout(() => finish(0), timeoutMs)
    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', checkDuration)
      audio.removeEventListener('durationchange', checkDuration)
      audio.removeEventListener('error', onError)
      clearTimeout(timeoutId)
    }

    audio.addEventListener('loadedmetadata', checkDuration)
    audio.addEventListener('durationchange', checkDuration)
    audio.addEventListener('error', onError)
    audio.src = src
  })
}

export default function EpisodeFormPanel({ seasonId, episode, onSave, onCancel }: EpisodeFormPanelProps) {
  const [title, setTitle] = useState(episode?.title ?? '')
  const [number, setNumber] = useState(episode?.number?.toString() ?? '')
  const [publishDate, setPublishDate] = useState(episode?.publish_date ?? '')
  const [audioType, setAudioType] = useState<'url' | 'upload'>(episode?.audio_type ?? 'url')
  const [audioPath, setAudioPath] = useState(episode?.audio_path ?? '')
  const [description, setDescription] = useState(episode?.description ?? '')
  const [guests, setGuests] = useState(episode?.guests ?? '')
  const [tags, setTags] = useState(episode?.tags ?? '')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [coverArtPath, setCoverArtPath] = useState(episode?.cover_art_path ?? null)
  const [coverArtThumbPath, setCoverArtThumbPath] = useState(episode?.cover_art_thumb_path ?? null)
  const [artUploading, setArtUploading] = useState(false)
  const [artUploadError, setArtUploadError] = useState('')
  const [durationSeconds, setDurationSeconds] = useState(episode?.duration_seconds ?? 0)
  const [detectingDuration, setDetectingDuration] = useState(false)
  // Set when a URL-type episode's duration probe fails at save time — the
  // most common real-world cause is the external host not allowing
  // cross-origin (CORS) audio requests, which the browser reports as an
  // opaque, generic error with no distinguishing detail available to us
  // (issue #84). A failed probe never blocks saving (see probeAudioDuration's
  // doc comment), but this is worth surfacing so an admin doesn't publish an
  // episode that then silently fails to play for every listener.
  const [probeFailedHint, setProbeFailedHint] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError('')

    // Probe the local file directly (object URL, no network round-trip or
    // CORS concerns) in parallel with the actual upload.
    const objectUrl = URL.createObjectURL(file)
    setDetectingDuration(true)
    void probeAudioDuration(objectUrl).then(seconds => {
      setDurationSeconds(seconds)
      setDetectingDuration(false)
      URL.revokeObjectURL(objectUrl)
    })

    try {
      const result = await uploadAudio(file)
      setAudioPath(result.path)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleArtFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setArtUploading(true)
    setArtUploadError('')
    try {
      const result = await uploadEpisodeArt(file)
      setCoverArtPath(result.detail)
      setCoverArtThumbPath(result.thumb)
    } catch (err) {
      setArtUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setArtUploading(false)
    }
  }

  function handleRemoveArt() {
    setCoverArtPath(null)
    setCoverArtThumbPath(null)
    setArtUploadError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      // URL-based audio is probed here, at submit time, rather than eagerly
      // on blur — probing on blur meant a real network fetch (with its own
      // async re-renders) could land mid-click on an admin trying to save,
      // and it has no benefit over probing once right before saving anyway.
      let detectedDuration = durationSeconds
      if (audioType === 'url' && audioPath) {
        setDetectingDuration(true)
        const probed = await probeAudioDuration(audioPath)
        setDetectingDuration(false)
        setProbeFailedHint(probed === 0)
        // A failed probe (0) shouldn't clobber a previously-known-good
        // duration on a simple metadata edit — only adopt it when it
        // actually resolved to something real.
        if (probed > 0) {
          detectedDuration = probed
          setDurationSeconds(probed)
        }
      }

      const formData: Partial<Episode> = {
        title,
        number: Number(number),
        publish_date: publishDate,
        audio_type: audioType,
        audio_path: audioPath,
        description,
        guests,
        tags,
        cover_art_path: coverArtPath,
        cover_art_thumb_path: coverArtThumbPath,
        duration_seconds: detectedDuration,
      }
      const result = episode
        ? await updateEpisode(episode.id, formData)
        : await createEpisode({ ...formData, season_id: seasonId })
      onSave(result)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 overflow-y-auto p-6 shadow-xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">{episode ? 'Edit Episode' : 'New Episode'}</h2>
        <button onClick={onCancel} aria-label="Close" className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">✕</button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1" htmlFor="ep-title">Title</label>
          <input id="ep-title" type="text" value={title} onChange={e => setTitle(e.target.value)} required
            className="w-full rounded bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-zinc-100" />
        </div>
        <div>
          <label className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1" htmlFor="ep-number">Episode #</label>
          <input id="ep-number" type="number" value={number} onChange={e => setNumber(e.target.value)} required
            className="w-full rounded bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-zinc-100" />
        </div>
        <div>
          <label className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1" htmlFor="ep-publish-date">Publish Date</label>
          <input id="ep-publish-date" type="date" value={publishDate} onChange={e => setPublishDate(e.target.value)} required
            className="w-full rounded bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-zinc-100" />
        </div>
        <div>
          <label className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1" htmlFor="ep-audio-type">Audio Type</label>
          <select id="ep-audio-type" value={audioType} onChange={e => setAudioType(e.target.value as 'url' | 'upload')}
            className="w-full rounded bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-zinc-100">
            <option value="url">URL</option>
            <option value="upload">Upload</option>
          </select>
        </div>
        {audioType === 'url' ? (
          <div>
            <label className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1" htmlFor="ep-audio-path">Audio URL</label>
            <input id="ep-audio-path" type="text" value={audioPath}
              onChange={e => { setAudioPath(e.target.value); setProbeFailedHint(false) }} required
              className="w-full rounded bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-zinc-100" />
            {detectingDuration && <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Detecting duration...</p>}
            {!detectingDuration && durationSeconds > 0 && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Duration: {formatDuration(durationSeconds)}</p>
            )}
            {!detectingDuration && probeFailedHint && (
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                Couldn&apos;t read this URL&apos;s audio — it may not allow cross-origin (CORS) playback, or the host may be
                unreachable. The episode will still save, but verify playback manually before publishing.
              </p>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1" htmlFor="ep-audio-file">Audio File</label>
            <input id="ep-audio-file" type="file" accept="audio/*" onChange={handleFileChange}
              className="w-full rounded bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-zinc-100" />
            {uploading && <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Uploading...</p>}
            {uploadError && <p className="text-sm text-red-600 dark:text-red-400 mt-1">{uploadError}</p>}
            {audioPath && !uploading && (
              <p className="text-sm text-green-600 dark:text-green-400 mt-1">Uploaded: {audioPath}</p>
            )}
            {detectingDuration && <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Detecting duration...</p>}
            {!detectingDuration && durationSeconds > 0 && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Duration: {formatDuration(durationSeconds)}</p>
            )}
          </div>
        )}
        <div>
          <label className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1" htmlFor="ep-cover-art">Cover Art</label>
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
              {coverArtThumbPath && (
                <img src={coverArtThumbPath} alt="Cover art preview" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <input id="ep-cover-art" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleArtFileChange}
                className="w-full rounded bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-zinc-100" />
              {artUploading && <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Uploading...</p>}
              {artUploadError && <p className="text-sm text-red-600 dark:text-red-400 mt-1">{artUploadError}</p>}
              {coverArtPath && !artUploading && (
                <button type="button" onClick={handleRemoveArt} className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 mt-1">
                  Remove cover art
                </button>
              )}
            </div>
          </div>
        </div>
        <div>
          <label className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1" htmlFor="ep-description">Description</label>
          <textarea id="ep-description" value={description} onChange={e => setDescription(e.target.value)} rows={3}
            className="w-full rounded bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-zinc-100" />
        </div>
        <div>
          <label className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1" htmlFor="ep-guests">Guests</label>
          <input id="ep-guests" type="text" value={guests} onChange={e => setGuests(e.target.value)}
            className="w-full rounded bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-zinc-100" />
        </div>
        <div>
          <label className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1" htmlFor="ep-tags">Tags (comma-separated)</label>
          <input id="ep-tags" type="text" value={tags} onChange={e => setTags(e.target.value)}
            className="w-full rounded bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-zinc-100" />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={submitting} className="flex-1 rounded bg-[var(--accent)] py-2 text-[var(--accent-contrast)] font-medium hover:opacity-90 disabled:opacity-50">
            {submitting ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onCancel} className="flex-1 rounded bg-zinc-200 py-2 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
