import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import MobileTabBar from '../components/MobileTabBar'

function renderBar(overrides: Partial<Parameters<typeof MobileTabBar>[0]> = {}) {
  return render(
    <MobileTabBar
      activeTab="episodes"
      onSelectPlaying={() => {}}
      onSelectEpisodes={() => {}}
      onSelectSettings={() => {}}
      {...overrides}
    />
  )
}

it('renders all three tabs with no icons, just text labels', () => {
  renderBar()
  expect(screen.getByRole('button', { name: 'Playing' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Episodes' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
  expect(document.querySelector('svg')).not.toBeInTheDocument()
})

it('marks the Episodes tab current when active', () => {
  renderBar({ activeTab: 'episodes' })
  expect(screen.getByRole('button', { name: 'Episodes' })).toHaveAttribute('aria-current', 'true')
  expect(screen.getByRole('button', { name: 'Settings' })).not.toHaveAttribute('aria-current')
  expect(screen.getByRole('button', { name: 'Playing' })).not.toHaveAttribute('aria-current')
})

it('marks the Settings tab current when active', () => {
  renderBar({ activeTab: 'settings' })
  expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-current', 'true')
})

it('marks the Playing tab current when active', () => {
  renderBar({ activeTab: 'playing' })
  expect(screen.getByRole('button', { name: 'Playing' })).toHaveAttribute('aria-current', 'true')
})

it('marks no tab current when activeTab is null (browsing a non-playing episode\'s detail)', () => {
  renderBar({ activeTab: null })
  expect(screen.getByRole('button', { name: 'Playing' })).not.toHaveAttribute('aria-current')
  expect(screen.getByRole('button', { name: 'Episodes' })).not.toHaveAttribute('aria-current')
  expect(screen.getByRole('button', { name: 'Settings' })).not.toHaveAttribute('aria-current')
})

it('calls onSelectEpisodes and onSelectSettings when tapped', async () => {
  const user = userEvent.setup()
  const onSelectEpisodes = vi.fn()
  const onSelectSettings = vi.fn()
  renderBar({ onSelectEpisodes, onSelectSettings })
  await user.click(screen.getByRole('button', { name: 'Settings' }))
  expect(onSelectSettings).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('button', { name: 'Episodes' }))
  expect(onSelectEpisodes).toHaveBeenCalledTimes(1)
})

it('the Playing tab is always enabled (never disabled), even with nothing implied to be loaded', () => {
  renderBar()
  expect(screen.getByRole('button', { name: 'Playing' })).toBeEnabled()
})

it('calls onSelectPlaying when the Playing tab is tapped', async () => {
  const user = userEvent.setup()
  const onSelectPlaying = vi.fn()
  renderBar({ onSelectPlaying })
  await user.click(screen.getByRole('button', { name: 'Playing' }))
  expect(onSelectPlaying).toHaveBeenCalledTimes(1)
})
