import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Masthead from '../components/Masthead'

it('renders podcast name and tagline unconditionally', () => {
  render(<Masthead podcastName="Test Podcast" tagline="A show about things" />)
  expect(screen.getByText('Test Podcast')).toBeInTheDocument()
  expect(screen.getByText('A show about things')).toBeInTheDocument()
})

it('renders no controls when showControls is false or omitted', () => {
  render(<Masthead podcastName="Test Podcast" tagline="tagline" showControls={false} />)
  expect(screen.queryByRole('button', { name: 'Light' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Dark' })).not.toBeInTheDocument()
  expect(screen.queryByText(/KDUR/)).not.toBeInTheDocument()
})

it('renders the station callout and Light/Dark toggle when showControls is true (Admin lives elsewhere now)', async () => {
  const user = userEvent.setup()
  const onToggleTheme = vi.fn()
  render(
    <Masthead
      podcastName="Test Podcast"
      tagline="tagline"
      showControls
      isDark={true}
      onToggleTheme={onToggleTheme}
    />
  )
  expect(screen.getByText(/KDUR/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Admin' })).not.toBeInTheDocument()

  const light = screen.getByRole('button', { name: 'Light' })
  const dark = screen.getByRole('button', { name: 'Dark' })
  expect(light).toHaveAttribute('aria-pressed', 'false')
  expect(dark).toHaveAttribute('aria-pressed', 'true')
  await user.click(light)
  expect(onToggleTheme).toHaveBeenCalledTimes(1)
})
