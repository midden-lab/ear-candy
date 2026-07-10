import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach } from 'vitest'
import ThemeBadge from '../components/ThemeBadge'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})

it('renders a toggle button with accessible label', () => {
  render(<ThemeBadge isDark={false} onToggle={() => {}} />)
  expect(screen.getByRole('button', { name: /toggle dark mode|toggle light mode/i })).toBeInTheDocument()
})

it('shows sun icon when isDark is false', () => {
  render(<ThemeBadge isDark={false} onToggle={() => {}} />)
  expect(screen.getByText('☀️')).toBeInTheDocument()
})

it('shows moon icon when isDark is true', () => {
  render(<ThemeBadge isDark={true} onToggle={() => {}} />)
  expect(screen.getByText('🌙')).toBeInTheDocument()
})

it('calls onToggle when clicked', async () => {
  const user = userEvent.setup()
  const onToggle = vi.fn()
  render(<ThemeBadge isDark={false} onToggle={onToggle} />)
  await user.click(screen.getByRole('button'))
  expect(onToggle).toHaveBeenCalledTimes(1)
})
