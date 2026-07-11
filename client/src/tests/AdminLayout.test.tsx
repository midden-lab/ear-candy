import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, beforeEach, afterEach } from 'vitest'
import AdminLayout from '../pages/admin/AdminLayout'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it('renders "Ear Candy Admin" heading once session check succeeds', async () => {
  render(<AdminLayout onLogout={vi.fn()} onUnauthorized={vi.fn()}>content</AdminLayout>)
  expect(await screen.findByText('Ear Candy Admin')).toBeInTheDocument()
})

it('renders children once session check succeeds', async () => {
  render(<AdminLayout onLogout={vi.fn()} onUnauthorized={vi.fn()}><div>child content</div></AdminLayout>)
  expect(await screen.findByText('child content')).toBeInTheDocument()
})

it('clicking "Sign out" calls onLogout', async () => {
  const onLogout = vi.fn()
  render(<AdminLayout onLogout={onLogout} onUnauthorized={vi.fn()}>content</AdminLayout>)
  await userEvent.click(await screen.findByText('Sign out'))
  expect(onLogout).toHaveBeenCalledOnce()
})

it('calls onUnauthorized and renders nothing when session check fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
  const onUnauthorized = vi.fn()
  const { container } = render(<AdminLayout onLogout={vi.fn()} onUnauthorized={onUnauthorized}>content</AdminLayout>)
  await waitFor(() => expect(onUnauthorized).toHaveBeenCalledOnce())
  expect(container).toBeEmptyDOMElement()
})

it('calls onUnauthorized when the session check request errors', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
  const onUnauthorized = vi.fn()
  render(<AdminLayout onLogout={vi.fn()} onUnauthorized={onUnauthorized}>content</AdminLayout>)
  await waitFor(() => expect(onUnauthorized).toHaveBeenCalledOnce())
})
