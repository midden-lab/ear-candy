import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AdminAnalytics from '../pages/admin/AdminAnalytics'
import * as api from '../api'
import type { AnalyticsOverview, AnalyticsEpisodeStat, AnalyticsBreakdowns } from '../types'

vi.mock('../api', () => ({
  getAnalyticsOverview: vi.fn(),
  getAnalyticsEpisodeStats: vi.fn(),
  getAnalyticsBreakdowns: vi.fn(),
}))

const overviewWithData: AnalyticsOverview = {
  totalPageViews: 42,
  totalPlayStarts: 17,
  totalPlayCompletes: 9,
  uniqueSessions: 12,
  newSessions: 8,
  returningSessions: 4,
  timeseries: [
    { date: '2026-08-27', page_views: 10, play_starts: 3 },
    { date: '2026-08-28', page_views: 32, play_starts: 14 },
  ],
}

const episodeStatsWithData: AnalyticsEpisodeStat[] = [
  { episode_id: 1, title: 'Episode One', play_starts: 10, play_completes: 5, completion_rate: 0.5, milestone_25: 8, milestone_50: 6, milestone_75: 5, milestone_90: 4 },
  { episode_id: 2, title: 'Episode Two', play_starts: 7, play_completes: 4, completion_rate: 4 / 7, milestone_25: 6, milestone_50: 5, milestone_75: 4, milestone_90: 3 },
]

const breakdownsWithData: AnalyticsBreakdowns = {
  countries: [{ key: 'US', count: 20 }, { key: 'CA', count: 5 }],
  devices: [{ key: 'desktop', count: 15 }, { key: 'mobile', count: 10 }],
  browsers: [{ key: 'Chrome', count: 18 }],
  os: [{ key: 'macOS', count: 11 }],
  referrers: [{ key: 'share-link', count: 7 }],
}

const emptyOverview: AnalyticsOverview = {
  totalPageViews: 0, totalPlayStarts: 0, totalPlayCompletes: 0,
  uniqueSessions: 0, newSessions: 0, returningSessions: 0, timeseries: [],
}
const emptyBreakdowns: AnalyticsBreakdowns = { countries: [], devices: [], browsers: [], os: [], referrers: [] }

function mockData(overview = overviewWithData, episodes = episodeStatsWithData, breakdowns = breakdownsWithData) {
  vi.mocked(api.getAnalyticsOverview).mockResolvedValue(overview)
  vi.mocked(api.getAnalyticsEpisodeStats).mockResolvedValue(episodes)
  vi.mocked(api.getAnalyticsBreakdowns).mockResolvedValue(breakdowns)
}

describe('AdminAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a loading state before data arrives', () => {
    vi.mocked(api.getAnalyticsOverview).mockReturnValue(new Promise(() => {}))
    vi.mocked(api.getAnalyticsEpisodeStats).mockReturnValue(new Promise(() => {}))
    vi.mocked(api.getAnalyticsBreakdowns).mockReturnValue(new Promise(() => {}))
    render(<AdminAnalytics />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('renders the summary stats once data loads', async () => {
    mockData()
    render(<AdminAnalytics />)
    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument())
    expect(screen.getByText('Page views')).toBeInTheDocument()
    expect(screen.getByText('17')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('renders the episode table sorted as returned by the API, with completion rate as a percentage', async () => {
    mockData()
    render(<AdminAnalytics />)
    await waitFor(() => expect(screen.getByText('Episode One')).toBeInTheDocument())
    expect(screen.getByText('Episode Two')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('renders exactly the rows the API returned, with no additional client-side filtering', async () => {
    mockData()
    render(<AdminAnalytics />)
    await waitFor(() => expect(screen.getByText('Episode One')).toBeInTheDocument())
    // The API (Step 5) already omits episodes with zero events — the
    // component must render precisely what it's given, not re-filter.
    expect(screen.getAllByRole('row')).toHaveLength(episodeStatsWithData.length + 1) // +1 header row
  })

  it('renders breakdown lists for country, device, browser, os, and referrer', async () => {
    mockData()
    render(<AdminAnalytics />)
    await waitFor(() => expect(screen.getByText('Countries')).toBeInTheDocument())
    expect(screen.getByText('US')).toBeInTheDocument()
    expect(screen.getByText('Devices')).toBeInTheDocument()
    expect(screen.getByText('desktop')).toBeInTheDocument()
    expect(screen.getByText('Browsers')).toBeInTheDocument()
    expect(screen.getByText('Chrome')).toBeInTheDocument()
    expect(screen.getByText('Operating systems')).toBeInTheDocument()
    expect(screen.getByText('macOS')).toBeInTheDocument()
    expect(screen.getByText('Referrers')).toBeInTheDocument()
    expect(screen.getByText('share-link')).toBeInTheDocument()
  })

  it('shows empty-state copy instead of a chart/table when there is no data yet', async () => {
    mockData(emptyOverview, [], emptyBreakdowns)
    render(<AdminAnalytics />)
    await waitFor(() => expect(screen.getByText('No traffic recorded yet.')).toBeInTheDocument())
    expect(screen.getByText('No episode plays recorded yet.')).toBeInTheDocument()
    expect(screen.getAllByText('No data yet.').length).toBeGreaterThan(0)
  })
})
