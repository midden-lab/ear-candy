import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import MobileSettingsView from '../components/MobileSettingsView'

it('renders the Settings heading and Admin row', () => {
  render(<MobileSettingsView onAdminClick={() => {}} isDark={false} onToggleTheme={() => {}} />)
  expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Admin' })).toBeInTheDocument()
})

it('renders a Light/Dark theme switch reflecting isDark, matching the mockup exactly (not the old circular ThemeBadge)', () => {
  render(<MobileSettingsView onAdminClick={() => {}} isDark={true} onToggleTheme={() => {}} />)
  expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true')
})

it('calls onToggleTheme when either theme button is clicked', async () => {
  const user = userEvent.setup()
  const onToggleTheme = vi.fn()
  render(<MobileSettingsView onAdminClick={() => {}} isDark={false} onToggleTheme={onToggleTheme} />)
  await user.click(screen.getByRole('button', { name: 'Light' }))
  expect(onToggleTheme).toHaveBeenCalledTimes(1)
})

it('renders the station callout', () => {
  render(<MobileSettingsView onAdminClick={() => {}} isDark={false} onToggleTheme={() => {}} />)
  expect(screen.getByText(/KDUR/)).toBeInTheDocument()
})

it('calls onAdminClick when the Admin row is tapped', async () => {
  const user = userEvent.setup()
  const onAdminClick = vi.fn()
  render(<MobileSettingsView onAdminClick={onAdminClick} isDark={false} onToggleTheme={() => {}} />)
  await user.click(screen.getByRole('button', { name: 'Admin' }))
  expect(onAdminClick).toHaveBeenCalledTimes(1)
})
