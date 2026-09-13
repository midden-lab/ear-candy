import { useState } from 'react'
import type { Season } from '../../types'
import { updateSeason } from '../../api'

interface SeasonFormPanelProps {
  season: Season
  onSave: (season: Season) => void
  onCancel: () => void
}

export default function SeasonFormPanel({ season, onSave, onCancel }: SeasonFormPanelProps) {
  const [title, setTitle] = useState(season.title)
  const [number, setNumber] = useState(String(season.number))
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const result = await updateSeason(season.id, { title, number: Number(number) })
      onSave(result)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 overflow-y-auto p-6 shadow-xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Edit Season</h2>
        <button onClick={onCancel} aria-label="Close" className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">✕</button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1" htmlFor="season-title">Title</label>
          <input id="season-title" type="text" value={title} onChange={e => setTitle(e.target.value)} required
            className="w-full rounded bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-zinc-100" />
        </div>
        <div>
          <label className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1" htmlFor="season-number">Season #</label>
          <input id="season-number" type="number" value={number} onChange={e => setNumber(e.target.value)} required
            className="w-full rounded bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-zinc-100" />
        </div>
        <div className="flex gap-2 pt-2">
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
