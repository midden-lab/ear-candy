import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import ShareMenu from '../components/ShareMenu'

// userEvent.setup() unconditionally installs its own navigator.clipboard
// stub (a real object with a working writeText), overwriting any mock
// assigned beforehand — so `user` must be created first, and the spy
// attached to whatever stub it installed, not to a replacement object.
function setupUser() {
  const user = userEvent.setup()
  const writeTextMock = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
  return { user, writeTextMock }
}

it('renders a closed menu by default', () => {
  render(<ShareMenu episodeId={1} episodeTitle="Test Episode" />)
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

it('opens the menu on click, showing copy/X/Facebook options', async () => {
  const user = userEvent.setup()
  render(<ShareMenu episodeId={1} episodeTitle="Test Episode" />)
  await user.click(screen.getByRole('button'))
  expect(screen.getByText('Copy link')).toBeInTheDocument()
  expect(screen.getByText('Share to X')).toBeInTheDocument()
  expect(screen.getByText('Share to Facebook')).toBeInTheDocument()
})

it('does not show a timestamp option when currentTime is omitted', async () => {
  const user = userEvent.setup()
  render(<ShareMenu episodeId={1} episodeTitle="Test Episode" />)
  await user.click(screen.getByRole('button'))
  expect(screen.queryByText(/share from the beginning/i)).not.toBeInTheDocument()
})

it('does not show a timestamp option when currentTime is below the minimum threshold', async () => {
  const user = userEvent.setup()
  render(<ShareMenu episodeId={1} episodeTitle="Test Episode" currentTime={2} />)
  await user.click(screen.getByRole('button'))
  expect(screen.queryByText(/share from the beginning/i)).not.toBeInTheDocument()
})

it('shows a timestamp toggle, defaulted to including the timestamp, when currentTime is meaningful', async () => {
  const user = userEvent.setup()
  render(<ShareMenu episodeId={1} episodeTitle="Test Episode" currentTime={90} />)
  await user.click(screen.getByRole('button'))
  expect(screen.getByText(/includes timestamp 1:30/i)).toBeInTheDocument()
  const checkbox = screen.getByRole('checkbox', { name: /share from the beginning/i })
  expect(checkbox).not.toBeChecked()
})

it('copies the beginning-only URL when no currentTime is given', async () => {
  const { user, writeTextMock } = setupUser()
  render(<ShareMenu episodeId={42} episodeTitle="Test Episode" />)
  await user.click(screen.getByRole('button'))
  await user.click(screen.getByText('Copy link'))
  expect(writeTextMock).toHaveBeenCalledWith(`${window.location.origin}/?episode=42`)
})

it('copies a timestamped URL by default when currentTime is meaningful', async () => {
  const { user, writeTextMock } = setupUser()
  render(<ShareMenu episodeId={42} episodeTitle="Test Episode" currentTime={90} />)
  await user.click(screen.getByRole('button'))
  await user.click(screen.getByText('Copy link'))
  expect(writeTextMock).toHaveBeenCalledWith(`${window.location.origin}/?episode=42&t=90`)
})

it('copies a beginning-only URL after unchecking the timestamp toggle', async () => {
  const { user, writeTextMock } = setupUser()
  render(<ShareMenu episodeId={42} episodeTitle="Test Episode" currentTime={90} />)
  await user.click(screen.getByRole('button'))
  await user.click(screen.getByRole('checkbox', { name: /share from the beginning/i }))
  await user.click(screen.getByText('Copy link'))
  expect(writeTextMock).toHaveBeenCalledWith(`${window.location.origin}/?episode=42`)
})

it('shows brief "Copied!" confirmation after copying', async () => {
  const { user } = setupUser()
  render(<ShareMenu episodeId={1} episodeTitle="Test Episode" />)
  await user.click(screen.getByRole('button'))
  await user.click(screen.getByText('Copy link'))
  expect(screen.getByText('Copied!')).toBeInTheDocument()
})

it('builds correct X and Facebook share intent links', async () => {
  const user = userEvent.setup()
  render(<ShareMenu episodeId={42} episodeTitle="Cool Episode" />)
  await user.click(screen.getByRole('button'))
  const shareUrl = `${window.location.origin}/?episode=42`
  expect(screen.getByText('Share to X').closest('a')).toHaveAttribute(
    'href',
    `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent('Listening to "Cool Episode"')}`
  )
  expect(screen.getByText('Share to Facebook').closest('a')).toHaveAttribute(
    'href',
    `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`
  )
})

it('closes the menu on Escape', async () => {
  const user = userEvent.setup()
  render(<ShareMenu episodeId={1} episodeTitle="Test Episode" />)
  await user.click(screen.getByRole('button'))
  expect(screen.getByRole('menu')).toBeInTheDocument()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

it('closes the menu on an outside click', async () => {
  const user = userEvent.setup()
  render(
    <div>
      <ShareMenu episodeId={1} episodeTitle="Test Episode" />
      <button>outside</button>
    </div>
  )
  await user.click(screen.getByRole('button', { name: /share/i }))
  expect(screen.getByRole('menu')).toBeInTheDocument()
  await user.click(screen.getByText('outside'))
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

it('renders icon-only (no visible "Share" text) by default', () => {
  render(<ShareMenu episodeId={1} episodeTitle="Test Episode" />)
  expect(screen.queryByText('Share')).not.toBeInTheDocument()
  expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Share episode')
})

it('renders icon+label when variant is "labeled"', () => {
  render(<ShareMenu episodeId={1} episodeTitle="Test Episode" variant="labeled" />)
  expect(screen.getByText('Share')).toBeInTheDocument()
})
