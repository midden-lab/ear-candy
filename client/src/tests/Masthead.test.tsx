import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Masthead from '../components/Masthead'

it('renders podcast name and tagline unconditionally', () => {
  render(<Masthead podcastName="Test Podcast" tagline="A show about things" />)
  expect(screen.getByText('Test Podcast')).toBeInTheDocument()
  expect(screen.getByText('A show about things')).toBeInTheDocument()
})

it('renders no theme toggle or Admin control when showControls is false', () => {
  render(<Masthead podcastName="Test Podcast" tagline="tagline" showControls={false} />)
  expect(screen.queryByRole('button', { name: 'Light' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Dark' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Admin' })).not.toBeInTheDocument()
})

it('renders no controls by default (showControls omitted)', () => {
  render(<Masthead podcastName="Test Podcast" tagline="tagline" />)
  expect(screen.queryByRole('button', { name: 'Admin' })).not.toBeInTheDocument()
})

it('renders Light/Dark toggle with aria-pressed reflecting isDark, and calls onToggleTheme when clicked', async () => {
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
  const light = screen.getByRole('button', { name: 'Light' })
  const dark = screen.getByRole('button', { name: 'Dark' })
  expect(light).toHaveAttribute('aria-pressed', 'false')
  expect(dark).toHaveAttribute('aria-pressed', 'true')

  await user.click(light)
  expect(onToggleTheme).toHaveBeenCalledTimes(1)

  await user.click(dark)
  expect(onToggleTheme).toHaveBeenCalledTimes(2)
})

it('renders an Admin control that calls onAdminClick when clicked', async () => {
  const user = userEvent.setup()
  const onAdminClick = vi.fn()
  render(
    <Masthead
      podcastName="Test Podcast"
      tagline="tagline"
      showControls
      onAdminClick={onAdminClick}
    />
  )
  await user.click(screen.getByRole('button', { name: 'Admin' }))
  expect(onAdminClick).toHaveBeenCalledTimes(1)
})
