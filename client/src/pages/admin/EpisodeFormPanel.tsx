import { useState } from 'react'
import type { Episode } from '../../types'
import { createEpisode, updateEpisode } from '../../api'

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
        <div>
          <label className="block text-sm text-zinc-400 mb-1" htmlFor="ep-audio-path">Audio Path/URL</label>
          <input id="ep-audio-path" type="text" value={audioPath} onChange={e => setAudioPath(e.target.value)} required
            className="w-full rounded bg-zinc-800 px-3 py-2 text-zinc-100" />
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
