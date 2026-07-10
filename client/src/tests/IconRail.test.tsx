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

it('renders a "Seasons" nav icon button', () => {
  render(<IconRail onAdminClick={() => {}} />)
  expect(screen.getByRole('button', { name: 'Seasons' })).toBeInTheDocument()
})

it('renders a "Search" nav icon button', () => {
  render(<IconRail onAdminClick={() => {}} />)
  expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument()
})
