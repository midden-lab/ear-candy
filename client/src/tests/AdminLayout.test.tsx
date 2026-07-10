import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import AdminLayout from '../pages/admin/AdminLayout'

it('renders "Ear Candy Admin" heading', () => {
  render(<AdminLayout onLogout={vi.fn()}>content</AdminLayout>)
  expect(screen.getByText('Ear Candy Admin')).toBeInTheDocument()
})

it('renders children', () => {
  render(<AdminLayout onLogout={vi.fn()}><div>child content</div></AdminLayout>)
  expect(screen.getByText('child content')).toBeInTheDocument()
})

it('clicking "Sign out" calls onLogout', async () => {
  const onLogout = vi.fn()
  render(<AdminLayout onLogout={onLogout}>content</AdminLayout>)
  await userEvent.click(screen.getByText('Sign out'))
  expect(onLogout).toHaveBeenCalledOnce()
})
