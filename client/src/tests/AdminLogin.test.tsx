import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminLogin from '../pages/AdminLogin'
import { login } from '../api'

vi.mock('../api', () => ({
  login: vi.fn(),
  getSettings: vi.fn(),
  getSeasons: vi.fn(),
  getEpisodes: vi.fn(),
  getEpisode: vi.fn(),
}))

const mockLogin = login as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AdminLogin', () => {
  it('renders heading, password input, and submit button', () => {
    render(<AdminLogin onSuccess={() => {}} />)
    expect(screen.getByRole('heading', { name: /admin login/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('calls login and invokes onSuccess on correct password', async () => {
    mockLogin.mockResolvedValueOnce(undefined)
    const onSuccess = vi.fn()
    const user = userEvent.setup()

    render(<AdminLogin onSuccess={onSuccess} />)
    await user.type(screen.getByLabelText('Password'), 'mypassword')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(mockLogin).toHaveBeenCalledWith('mypassword')
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('shows error message with role="alert" on failed login', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid password'))
    const user = userEvent.setup()

    render(<AdminLogin onSuccess={() => {}} />)
    await user.type(screen.getByLabelText('Password'), 'wrongpassword')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid password')
  })

  it('shows "Signing in…" and disables button while loading', async () => {
    let resolveLogin!: () => void
    mockLogin.mockReturnValueOnce(
      new Promise<void>(resolve => {
        resolveLogin = resolve
      }),
    )
    const user = userEvent.setup()

    render(<AdminLogin onSuccess={() => {}} />)
    await user.type(screen.getByLabelText('Password'), 'mypassword')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    const button = screen.getByRole('button', { name: /signing in/i })
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Signing in…')

    resolveLogin()
  })
})
