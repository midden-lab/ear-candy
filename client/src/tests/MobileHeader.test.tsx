import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import MobileHeader from '../components/MobileHeader'

it('renders the podcast name', () => {
  render(<MobileHeader podcastName="My Podcast" onAdminClick={() => {}} />)
  expect(screen.getByText('My Podcast')).toBeInTheDocument()
})

it('overflow menu is closed by default', () => {
  render(<MobileHeader podcastName="My Podcast" onAdminClick={() => {}} />)
  expect(screen.queryByText('Admin')).not.toBeInTheDocument()
})

it('opens the overflow menu and shows Admin when the "More options" button is clicked', async () => {
  const user = userEvent.setup()
  render(<MobileHeader podcastName="My Podcast" onAdminClick={() => {}} />)
  await user.click(screen.getByRole('button', { name: 'More options' }))
  expect(screen.getByText('Admin')).toBeInTheDocument()
})

it('calls onAdminClick and closes the menu when Admin is clicked', async () => {
  const user = userEvent.setup()
  const onAdminClick = vi.fn()
  render(<MobileHeader podcastName="My Podcast" onAdminClick={onAdminClick} />)
  await user.click(screen.getByRole('button', { name: 'More options' }))
  await user.click(screen.getByText('Admin'))
  expect(onAdminClick).toHaveBeenCalledTimes(1)
  expect(screen.queryByText('Admin')).not.toBeInTheDocument()
})

it('renders the themeBadge inside the overflow menu when provided', async () => {
  const user = userEvent.setup()
  render(
    <MobileHeader
      podcastName="My Podcast"
      onAdminClick={() => {}}
      themeBadge={<button aria-label="Toggle dark mode">🌙</button>}
    />
  )
  await user.click(screen.getByRole('button', { name: 'More options' }))
  expect(screen.getByRole('button', { name: 'Toggle dark mode' })).toBeInTheDocument()
})
