import { useState } from 'react'
import type { Episode } from '../../types'
import { createEpisode, updateEpisode, uploadAudio, uploadEpisodeArt } from '../../api'

interface EpisodeFormPanelProps {
  seasonId: number
  episode?: Episode
  onSave: (ep: Episode) => void
  onCancel: () => void
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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError('')
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
    }
    const result = episode
      ? await updateEpisode(episode.id, formData)
      : await createEpisode({ ...formData, season_id: seasonId })
    onSave(result)
  }

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-zinc-900 border-l border-zinc-800 overflow-y-auto p-6 shadow-xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">{episode ? 'Edit Episode' : 'New Episode'}</h2>
        <button onClick={onCancel} aria-label="Close" className="text-zinc-400 hover:text-zinc-100">✕</button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-zinc-400 mb-1" htmlFor="ep-title">Title</label>
          <input id="ep-title" type="text" value={title} onChange={e => setTitle(e.target.value)} required
            className="w-full rounded bg-zinc-800 px-3 py-2 text-zinc-100" />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1" htmlFor="ep-number">Episode #</label>
          <input id="ep-number" type="number" value={number} onChange={e => setNumber(e.target.value)} required
            className="w-full rounded bg-zinc-800 px-3 py-2 text-zinc-100" />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1" htmlFor="ep-publish-date">Publish Date</label>
          <input id="ep-publish-date" type="date" value={publishDate} onChange={e => setPublishDate(e.target.value)} required
            className="w-full rounded bg-zinc-800 px-3 py-2 text-zinc-100" />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1" htmlFor="ep-audio-type">Audio Type</label>
          <select id="ep-audio-type" value={audioType} onChange={e => setAudioType(e.target.value as 'url' | 'upload')}
            className="w-full rounded bg-zinc-800 px-3 py-2 text-zinc-100">
            <option value="url">URL</option>
            <option value="upload">Upload</option>
          </select>
        </div>
        {audioType === 'url' ? (
          <div>
            <label className="block text-sm text-zinc-400 mb-1" htmlFor="ep-audio-path">Audio URL</label>
            <input id="ep-audio-path" type="text" value={audioPath} onChange={e => setAudioPath(e.target.value)} required
              className="w-full rounded bg-zinc-800 px-3 py-2 text-zinc-100" />
          </div>
        ) : (
          <div>
            <label className="block text-sm text-zinc-400 mb-1" htmlFor="ep-audio-file">Audio File</label>
            <input id="ep-audio-file" type="file" accept="audio/*" onChange={handleFileChange}
              className="w-full rounded bg-zinc-800 px-3 py-2 text-zinc-100" />
            {uploading && <p className="text-sm text-zinc-400 mt-1">Uploading...</p>}
            {uploadError && <p className="text-sm text-red-400 mt-1">{uploadError}</p>}
            {audioPath && !uploading && (
              <p className="text-sm text-green-400 mt-1">Uploaded: {audioPath}</p>
            )}
          </div>
        )}
        <div>
          <label className="block text-sm text-zinc-400 mb-1" htmlFor="ep-cover-art">Cover Art</label>
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-800">
              {coverArtThumbPath && (
                <img src={coverArtThumbPath} alt="Cover art preview" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <input id="ep-cover-art" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleArtFileChange}
                className="w-full rounded bg-zinc-800 px-3 py-2 text-zinc-100" />
              {artUploading && <p className="text-sm text-zinc-400 mt-1">Uploading...</p>}
              {artUploadError && <p className="text-sm text-red-400 mt-1">{artUploadError}</p>}
              {coverArtPath && !artUploading && (
                <button type="button" onClick={handleRemoveArt} className="text-sm text-zinc-400 hover:text-zinc-100 mt-1">
                  Remove cover art
                </button>
              )}
            </div>
          </div>
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1" htmlFor="ep-description">Description</label>
          <textarea id="ep-description" value={description} onChange={e => setDescription(e.target.value)} rows={3}
            className="w-full rounded bg-zinc-800 px-3 py-2 text-zinc-100" />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1" htmlFor="ep-guests">Guests</label>
          <input id="ep-guests" type="text" value={guests} onChange={e => setGuests(e.target.value)}
            className="w-full rounded bg-zinc-800 px-3 py-2 text-zinc-100" />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1" htmlFor="ep-tags">Tags (comma-separated)</label>
          <input id="ep-tags" type="text" value={tags} onChange={e => setTags(e.target.value)}
            className="w-full rounded bg-zinc-800 px-3 py-2 text-zinc-100" />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" className="flex-1 rounded bg-[var(--accent)] py-2 text-white font-medium hover:opacity-90">
            Save
          </button>
          <button type="button" onClick={onCancel} className="flex-1 rounded bg-zinc-800 py-2 text-zinc-300 hover:bg-zinc-700">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
