import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import ShareDialog from '../components/ShareDialog'

function setupUser() {
  const user = userEvent.setup()
  const writeTextMock = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
  return { user, writeTextMock }
}

afterEach(() => {
  document.body.style.overflow = ''
})

it('renders a closed dialog by default', () => {
  render(<ShareDialog episodeId={1} episodeTitle="Test Episode" />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('opens the dialog on trigger click, showing copy and Bluesky options', async () => {
  const user = userEvent.setup()
  render(<ShareDialog episodeId={1} episodeTitle="Test Episode" />)
  await user.click(screen.getByRole('button'))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByText('Share episode')).toBeInTheDocument()
  expect(screen.getByText('Copy')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Share to Bluesky' })).toBeInTheDocument()
})

// Facebook and X are temporarily disabled in the component (pending user
// research on which platforms to support) — re-enable these assertions
// alongside uncommenting the corresponding block in ShareDialog.tsx.
it.skip('shows Facebook and X share options', async () => {
  const user = userEvent.setup()
  render(<ShareDialog episodeId={1} episodeTitle="Test Episode" />)
  await user.click(screen.getByRole('button'))
  expect(screen.getByRole('link', { name: 'Share to X' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Share to Facebook' })).toBeInTheDocument()
})

it('does not currently show Facebook or X share options', async () => {
  const user = userEvent.setup()
  render(<ShareDialog episodeId={1} episodeTitle="Test Episode" />)
  await user.click(screen.getByRole('button'))
  expect(screen.queryByRole('link', { name: 'Share to X' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Share to Facebook' })).not.toBeInTheDocument()
})

it('does not show a timestamp option when currentTime is omitted', async () => {
  const user = userEvent.setup()
  render(<ShareDialog episodeId={1} episodeTitle="Test Episode" />)
  await user.click(screen.getByRole('button'))
  expect(screen.queryByText(/start at/i)).not.toBeInTheDocument()
})

it('does not show a timestamp option when currentTime is below the minimum threshold', async () => {
  const user = userEvent.setup()
  render(<ShareDialog episodeId={1} episodeTitle="Test Episode" currentTime={2} />)
  await user.click(screen.getByRole('button'))
  expect(screen.queryByText(/start at/i)).not.toBeInTheDocument()
})

it('shows a checked "Start at mm:ss" checkbox when currentTime is meaningful', async () => {
  const user = userEvent.setup()
  render(<ShareDialog episodeId={1} episodeTitle="Test Episode" currentTime={90} />)
  await user.click(screen.getByRole('button'))
  const checkbox = screen.getByRole('checkbox', { name: /start at 1:30/i })
  expect(checkbox).toBeChecked()
})

it('copies the beginning-only URL when no currentTime is given', async () => {
  const { user, writeTextMock } = setupUser()
  render(<ShareDialog episodeId={42} episodeTitle="Test Episode" />)
  await user.click(screen.getByRole('button'))
  await user.click(screen.getByText('Copy'))
  expect(writeTextMock).toHaveBeenCalledWith(`${window.location.origin}/?episode=42`)
})

it('copies a timestamped URL by default when currentTime is meaningful', async () => {
  const { user, writeTextMock } = setupUser()
  render(<ShareDialog episodeId={42} episodeTitle="Test Episode" currentTime={90} />)
  await user.click(screen.getByRole('button'))
  await user.click(screen.getByText('Copy'))
  expect(writeTextMock).toHaveBeenCalledWith(`${window.location.origin}/?episode=42&t=90`)
})

it('copies a beginning-only URL after unchecking the timestamp checkbox', async () => {
  const { user, writeTextMock } = setupUser()
  render(<ShareDialog episodeId={42} episodeTitle="Test Episode" currentTime={90} />)
  await user.click(screen.getByRole('button'))
  await user.click(screen.getByRole('checkbox', { name: /start at 1:30/i }))
  await user.click(screen.getByText('Copy'))
  expect(writeTextMock).toHaveBeenCalledWith(`${window.location.origin}/?episode=42`)
})

it('shows brief "Copied" confirmation after copying', async () => {
  const { user } = setupUser()
  render(<ShareDialog episodeId={1} episodeTitle="Test Episode" />)
  await user.click(screen.getByRole('button'))
  await user.click(screen.getByText('Copy'))
  expect(screen.getByText('Copied')).toBeInTheDocument()
})

it('builds a correct Bluesky share intent link', async () => {
  const user = userEvent.setup()
  render(<ShareDialog episodeId={42} episodeTitle="Cool Episode" />)
  await user.click(screen.getByRole('button'))
  const shareUrl = `${window.location.origin}/?episode=42`
  expect(screen.getByRole('link', { name: 'Share to Bluesky' })).toHaveAttribute(
    'href',
    `https://bsky.app/intent/compose?text=${encodeURIComponent(`Listening to "Cool Episode"\n${shareUrl}`)}`
  )
})

it('closes on Escape and returns focus to the trigger button', async () => {
  const user = userEvent.setup()
  render(<ShareDialog episodeId={1} episodeTitle="Test Episode" />)
  const trigger = screen.getByRole('button')
  await user.click(trigger)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

it('closes on backdrop click but not on a click inside the panel', async () => {
  const user = userEvent.setup()
  render(<ShareDialog episodeId={1} episodeTitle="Test Episode" />)
  await user.click(screen.getByRole('button'))
  const dialog = screen.getByRole('dialog')

  await user.click(dialog)
  expect(screen.getByRole('dialog')).toBeInTheDocument()

  // The backdrop is the dialog's parent element.
  await user.click(dialog.parentElement!)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('closes and returns focus after the explicit close button is clicked', async () => {
  const user = userEvent.setup()
  render(<ShareDialog episodeId={1} episodeTitle="Test Episode" />)
  const trigger = screen.getByRole('button')
  await user.click(trigger)
  await user.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

it('has proper dialog accessibility attributes', async () => {
  const user = userEvent.setup()
  render(<ShareDialog episodeId={1} episodeTitle="Test Episode" />)
  await user.click(screen.getByRole('button'))
  const dialog = screen.getByRole('dialog')
  expect(dialog).toHaveAttribute('aria-modal', 'true')
  expect(dialog).toHaveAttribute('aria-labelledby', 'share-dialog-title')
})

it('locks body scroll while open and restores it on close', async () => {
  const user = userEvent.setup()
  render(<ShareDialog episodeId={1} episodeTitle="Test Episode" />)
  expect(document.body.style.overflow).not.toBe('hidden')
  await user.click(screen.getByRole('button'))
  expect(document.body.style.overflow).toBe('hidden')
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(document.body.style.overflow).not.toBe('hidden')
})

it('traps Tab focus within the dialog', async () => {
  const user = userEvent.setup()
  render(<ShareDialog episodeId={1} episodeTitle="Test Episode" currentTime={90} />)
  await user.click(screen.getByRole('button'))

  const focusable = screen.getByRole('dialog').querySelectorAll('button, a[href], input')
  const first = focusable[0] as HTMLElement
  const last = focusable[focusable.length - 1] as HTMLElement

  first.focus()
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
  expect(last).toHaveFocus()

  last.focus()
  fireEvent.keyDown(document, { key: 'Tab' })
  expect(first).toHaveFocus()
})
