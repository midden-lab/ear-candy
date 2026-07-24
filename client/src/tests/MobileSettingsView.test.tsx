import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import MobileSettingsView from '../components/MobileSettingsView'

it('renders the Settings heading and Admin dashboard row', () => {
  render(<MobileSettingsView onAdminClick={() => {}} themeBadge={<button aria-label="Toggle dark mode">🌙</button>} />)
  expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Admin dashboard' })).toBeInTheDocument()
})

it('renders the provided themeBadge', () => {
  render(<MobileSettingsView onAdminClick={() => {}} themeBadge={<button aria-label="Toggle dark mode">🌙</button>} />)
  expect(screen.getByRole('button', { name: 'Toggle dark mode' })).toBeInTheDocument()
})

it('calls onAdminClick when the Admin dashboard row is tapped', async () => {
  const user = userEvent.setup()
  const onAdminClick = vi.fn()
  render(<MobileSettingsView onAdminClick={onAdminClick} themeBadge={null} />)
  await user.click(screen.getByRole('button', { name: 'Admin dashboard' }))
  expect(onAdminClick).toHaveBeenCalledTimes(1)
})
