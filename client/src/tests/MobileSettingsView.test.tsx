import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import MobileSettingsView from '../components/MobileSettingsView'

it('renders the Settings heading (Admin lives in the episode list now, not here)', () => {
  render(<MobileSettingsView isDark={false} onToggleTheme={() => {}} />)
  expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Admin' })).not.toBeInTheDocument()
})

it('renders a Light/Dark theme switch reflecting isDark, matching the mockup exactly (not the old circular ThemeBadge)', () => {
  render(<MobileSettingsView isDark={true} onToggleTheme={() => {}} />)
  expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true')
})

it('calls onToggleTheme when either theme button is clicked', async () => {
  const user = userEvent.setup()
  const onToggleTheme = vi.fn()
  render(<MobileSettingsView isDark={false} onToggleTheme={onToggleTheme} />)
  await user.click(screen.getByRole('button', { name: 'Light' }))
  expect(onToggleTheme).toHaveBeenCalledTimes(1)
})

it('renders the station callout', () => {
  render(<MobileSettingsView isDark={false} onToggleTheme={() => {}} />)
  expect(screen.getByText(/KDUR/)).toBeInTheDocument()
})
