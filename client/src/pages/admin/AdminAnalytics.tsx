import { useEffect, useState } from 'react'
import { getAnalyticsOverview, getAnalyticsEpisodeStats, getAnalyticsBreakdowns } from '../../api'
import type { AnalyticsOverview, AnalyticsEpisodeStat, AnalyticsBreakdowns } from '../../types'

// No charting library — this app's client deps are intentionally minimal
// (react/react-dom/zustand only). Plain tables/lists plus a lightweight
// CSS-width "bar" for the timeseries cover this dashboard's needs without
// adding one.
const BREAKDOWN_TOP_N = 10

export default function AdminAnalytics() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null)
  const [episodeStats, setEpisodeStats] = useState<AnalyticsEpisodeStat[]>([])
  const [breakdowns, setBreakdowns] = useState<AnalyticsBreakdowns | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([getAnalyticsOverview(), getAnalyticsEpisodeStats(), getAnalyticsBreakdowns()]).then(([o, e, b]) => {
      if (!cancelled) {
        setOverview(o)
        setEpisodeStats(e)
        setBreakdowns(b)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [])

  if (loading || !overview || !breakdowns) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
  }

  const maxDailyPageViews = Math.max(1, ...overview.timeseries.map(d => d.page_views))

  return (
    <div className="max-w-4xl space-y-8">
      <h2 className="text-xl font-bold">Analytics</h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatTile label="Page views" value={overview.totalPageViews} />
        <StatTile label="Plays" value={overview.totalPlayStarts} />
        <StatTile label="Completions" value={overview.totalPlayCompletes} />
        <StatTile label="Unique sessions" value={overview.uniqueSessions} />
        <StatTile label="New sessions" value={overview.newSessions} />
        <StatTile label="Returning sessions" value={overview.returningSessions} />
      </div>

      <section>
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Traffic over time</h3>
        {overview.timeseries.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No traffic recorded yet.</p>
        ) : (
          <div className="space-y-1">
            {overview.timeseries.map(day => (
              <div key={day.date} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 text-zinc-500 dark:text-zinc-400">{day.date}</span>
                <div
                  className="h-3 rounded bg-[var(--accent)]"
                  style={{ width: `${(day.page_views / maxDailyPageViews) * 100}%`, minWidth: day.page_views > 0 ? '2px' : '0' }}
                />
                <span className="text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                  {day.page_views} view{day.page_views === 1 ? '' : 's'}, {day.play_starts} play{day.play_starts === 1 ? '' : 's'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Episodes</h3>
        {episodeStats.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No episode plays recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                  <th className="py-2 pr-4 font-medium">Episode</th>
                  <th className="py-2 pr-4 font-medium">Plays</th>
                  <th className="py-2 pr-4 font-medium">Completed</th>
                  <th className="py-2 pr-4 font-medium">Completion rate</th>
                </tr>
              </thead>
              <tbody>
                {episodeStats.map(ep => (
                  <tr key={ep.episode_id} className="border-b border-zinc-100 dark:border-zinc-900 text-zinc-900 dark:text-zinc-100">
                    <td className="py-2 pr-4">{ep.title}</td>
                    <td className="py-2 pr-4">{ep.play_starts}</td>
                    <td className="py-2 pr-4">{ep.play_completes}</td>
                    <td className="py-2 pr-4">{Math.round(ep.completion_rate * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <BreakdownList title="Countries" rows={breakdowns.countries} />
        <BreakdownList title="Devices" rows={breakdowns.devices} />
        <BreakdownList title="Browsers" rows={breakdowns.browsers} />
        <BreakdownList title="Operating systems" rows={breakdowns.os} />
        <BreakdownList title="Referrers" rows={breakdowns.referrers} />
      </section>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-zinc-100 dark:bg-zinc-800 px-4 py-3">
      <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{value}</div>
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
    </div>
  )
}

function BreakdownList({ title, rows }: { title: string; rows: { key: string; count: number }[] }) {
  const top = rows.slice(0, BREAKDOWN_TOP_N)
  return (
    <div>
      <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">{title}</h3>
      {top.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No data yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {top.map(row => (
            <li key={row.key} className="flex justify-between gap-3 text-zinc-700 dark:text-zinc-300">
              <span className="truncate">{row.key}</span>
              <span className="text-zinc-500 dark:text-zinc-400 shrink-0">{row.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
