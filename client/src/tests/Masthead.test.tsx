import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Masthead from '../components/Masthead'

it('renders podcast name and tagline unconditionally', () => {
  render(<Masthead podcastName="Sex In Your Ear" tagline="Because it feels good to be in the know!" />)
  expect(screen.getByText('Sex In Your Ear')).toBeInTheDocument()
  expect(screen.getByText('Because it feels good to be in the know!')).toBeInTheDocument()
})

it('renders no controls when showControls is false or omitted', () => {
  render(<Masthead podcastName="Sex In Your Ear" tagline="tagline" showControls={false} />)
  expect(screen.queryByRole('button', { name: 'Light' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Dark' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Admin' })).not.toBeInTheDocument()
  expect(screen.queryByText(/KDUR/)).not.toBeInTheDocument()
})

it('renders the station callout, Light/Dark toggle, and Admin control when showControls is true', async () => {
  const user = userEvent.setup()
  const onToggleTheme = vi.fn()
  const onAdminClick = vi.fn()
  render(
    <Masthead
      podcastName="Sex In Your Ear"
      tagline="tagline"
      showControls
      isDark={true}
      onToggleTheme={onToggleTheme}
      onAdminClick={onAdminClick}
    />
  )
  expect(screen.getByText(/KDUR/)).toBeInTheDocument()

  const light = screen.getByRole('button', { name: 'Light' })
  const dark = screen.getByRole('button', { name: 'Dark' })
  expect(light).toHaveAttribute('aria-pressed', 'false')
  expect(dark).toHaveAttribute('aria-pressed', 'true')
  await user.click(light)
  expect(onToggleTheme).toHaveBeenCalledTimes(1)

  await user.click(screen.getByRole('button', { name: 'Admin' }))
  expect(onAdminClick).toHaveBeenCalledTimes(1)
})
