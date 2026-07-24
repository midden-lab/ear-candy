import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import MobileTabBar from '../components/MobileTabBar'

it('marks the Episodes tab current when active', () => {
  render(
    <MobileTabBar
      activeTab="episodes"
      hasPlayerEpisode={false}
      onSelectEpisodes={() => {}}
      onSelectSettings={() => {}}
      onExpandPlayer={() => {}}
    />
  )
  expect(screen.getByText('Episodes').closest('button')).toHaveAttribute('aria-current', 'true')
  expect(screen.getByText('Settings').closest('button')).not.toHaveAttribute('aria-current')
})

it('marks the Settings tab current when active', () => {
  render(
    <MobileTabBar
      activeTab="settings"
      hasPlayerEpisode={false}
      onSelectEpisodes={() => {}}
      onSelectSettings={() => {}}
      onExpandPlayer={() => {}}
    />
  )
  expect(screen.getByText('Settings').closest('button')).toHaveAttribute('aria-current', 'true')
})

it('calls onSelectEpisodes and onSelectSettings when tapped', async () => {
  const user = userEvent.setup()
  const onSelectEpisodes = vi.fn()
  const onSelectSettings = vi.fn()
  render(
    <MobileTabBar
      activeTab="episodes"
      hasPlayerEpisode={false}
      onSelectEpisodes={onSelectEpisodes}
      onSelectSettings={onSelectSettings}
      onExpandPlayer={() => {}}
    />
  )
  await user.click(screen.getByText('Settings'))
  expect(onSelectSettings).toHaveBeenCalledTimes(1)
  await user.click(screen.getByText('Episodes'))
  expect(onSelectEpisodes).toHaveBeenCalledTimes(1)
})

it('disables the Now Playing tab when nothing is loaded', () => {
  render(
    <MobileTabBar
      activeTab="episodes"
      hasPlayerEpisode={false}
      onSelectEpisodes={() => {}}
      onSelectSettings={() => {}}
      onExpandPlayer={() => {}}
    />
  )
  expect(screen.getByRole('button', { name: 'Listening' })).toBeDisabled()
})

it('calls onExpandPlayer when Now Playing is tapped and an episode is loaded', async () => {
  const user = userEvent.setup()
  const onExpandPlayer = vi.fn()
  render(
    <MobileTabBar
      activeTab="episodes"
      hasPlayerEpisode
      onSelectEpisodes={() => {}}
      onSelectSettings={() => {}}
      onExpandPlayer={onExpandPlayer}
    />
  )
  const nowPlayingButton = screen.getByRole('button', { name: 'Listening' })
  expect(nowPlayingButton).toBeEnabled()
  await user.click(nowPlayingButton)
  expect(onExpandPlayer).toHaveBeenCalledTimes(1)
})

it('does not change activeTab styling when Now Playing is tapped', () => {
  render(
    <MobileTabBar
      activeTab="episodes"
      hasPlayerEpisode
      onSelectEpisodes={() => {}}
      onSelectSettings={() => {}}
      onExpandPlayer={() => {}}
    />
  )
  expect(screen.getByRole('button', { name: 'Listening' })).not.toHaveAttribute('aria-current')
})
