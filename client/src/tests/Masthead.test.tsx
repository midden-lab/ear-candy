import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Masthead from '../components/Masthead'

it('renders podcast name and tagline unconditionally', () => {
  render(<Masthead podcastName="Sex In Your Ear" tagline="Because it feels good to be in the know!" />)
  expect(screen.getByText('Sex In Your Ear')).toBeInTheDocument()
  expect(screen.getByText('Because it feels good to be in the know!')).toBeInTheDocument()
})

it('renders no theme toggle or Admin control when showControls is false', () => {
  render(<Masthead podcastName="Sex In Your Ear" tagline="tagline" showControls={false} />)
  expect(screen.queryByRole('button', { name: 'Light' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Dark' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Admin' })).not.toBeInTheDocument()
})

it('renders no controls by default (showControls omitted)', () => {
  render(<Masthead podcastName="Sex In Your Ear" tagline="tagline" />)
  expect(screen.queryByRole('button', { name: 'Admin' })).not.toBeInTheDocument()
})

it('renders Light/Dark toggle with aria-pressed reflecting isDark, and calls onToggleTheme when clicked', async () => {
  const user = userEvent.setup()
  const onToggleTheme = vi.fn()
  render(
    <Masthead
      podcastName="Sex In Your Ear"
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
      podcastName="Sex In Your Ear"
      tagline="tagline"
      showControls
      onAdminClick={onAdminClick}
    />
  )
  await user.click(screen.getByRole('button', { name: 'Admin' }))
  expect(onAdminClick).toHaveBeenCalledTimes(1)
})
