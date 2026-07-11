import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import IconRail from '../components/IconRail'

it('renders the admin button with aria-label="Admin settings"', () => {
  render(<IconRail onAdminClick={() => {}} />)
  expect(screen.getByRole('button', { name: 'Admin settings' })).toBeInTheDocument()
})

it('calls onAdminClick when the admin button is clicked', async () => {
  const user = userEvent.setup()
  const onAdminClick = vi.fn()
  render(<IconRail onAdminClick={onAdminClick} />)
  await user.click(screen.getByRole('button', { name: 'Admin settings' }))
  expect(onAdminClick).toHaveBeenCalledTimes(1)
})

it('renders a nav element', () => {
  render(<IconRail onAdminClick={() => {}} />)
  expect(document.querySelector('nav')).not.toBeNull()
})

it('renders an "Episodes" nav icon button', () => {
  render(<IconRail onAdminClick={() => {}} />)
  expect(screen.getByRole('button', { name: 'Episodes' })).toBeInTheDocument()
})

// Seasons and Search are temporarily hidden (SEASONS_AND_SEARCH_ENABLED = false
// in IconRail.tsx) since neither has any functionality wired up yet. Re-enable
// these tests once that flag flips back to true.
it.skip('renders a "Seasons" nav icon button', () => {
  render(<IconRail onAdminClick={() => {}} />)
  expect(screen.getByRole('button', { name: 'Seasons' })).toBeInTheDocument()
})

it.skip('renders a "Search" nav icon button', () => {
  render(<IconRail onAdminClick={() => {}} />)
  expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument()
})

it('does not render the Seasons/Search nav icons while they are disabled', () => {
  render(<IconRail onAdminClick={() => {}} />)
  expect(screen.queryByRole('button', { name: 'Seasons' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument()
})
