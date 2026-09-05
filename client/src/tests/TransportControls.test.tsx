import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import TransportControls from '../components/TransportControls'

function baseProps() {
  return {
    playing: false,
    onTogglePlay: vi.fn(),
    onSkipStart: vi.fn(),
    onSkipEnd: vi.fn(),
    onBack15: vi.fn(),
    onForward15: vi.fn(),
    speed: 1,
    onCycleSpeed: vi.fn(),
  }
}

it('renders skip, play, and speed controls by default', () => {
  render(<TransportControls {...baseProps()} />)
  expect(screen.getByRole('button', { name: 'Skip to start' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Back 15 seconds' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Forward 15 seconds' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Skip to end' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Playback speed' })).toBeInTheDocument()
})

it('shows Pause when playing is true', () => {
  render(<TransportControls {...baseProps()} playing={true} />)
  expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
})

it('shows a retry action instead of play/pause when error is true', () => {
  render(<TransportControls {...baseProps()} error={true} />)
  expect(screen.getByRole('button', { name: 'Retry playback' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument()
})

it('hides the central play/pause/retry button entirely when showPlayButton is false', () => {
  render(<TransportControls {...baseProps()} showPlayButton={false} />)
  expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Retry playback' })).not.toBeInTheDocument()
  // The rest of the row is unaffected.
  expect(screen.getByRole('button', { name: 'Back 15 seconds' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Forward 15 seconds' })).toBeInTheDocument()
})

it('calls the right handler for each skip/speed control', async () => {
  const user = userEvent.setup()
  const props = baseProps()
  render(<TransportControls {...props} />)
  await user.click(screen.getByRole('button', { name: 'Skip to start' }))
  expect(props.onSkipStart).toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Back 15 seconds' }))
  expect(props.onBack15).toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Forward 15 seconds' }))
  expect(props.onForward15).toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Skip to end' }))
  expect(props.onSkipEnd).toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Playback speed' }))
  expect(props.onCycleSpeed).toHaveBeenCalled()
})

it('calls onTogglePlay when the central button is clicked and there is no error', async () => {
  const user = userEvent.setup()
  const props = baseProps()
  render(<TransportControls {...props} />)
  await user.click(screen.getByRole('button', { name: 'Play' }))
  expect(props.onTogglePlay).toHaveBeenCalled()
})

it('calls onRetry instead of onTogglePlay when the central button is clicked in an error state', async () => {
  const user = userEvent.setup()
  const props = { ...baseProps(), error: true, onRetry: vi.fn() }
  render(<TransportControls {...props} />)
  await user.click(screen.getByRole('button', { name: 'Retry playback' }))
  expect(props.onRetry).toHaveBeenCalled()
  expect(props.onTogglePlay).not.toHaveBeenCalled()
})

it('displays the current speed', () => {
  render(<TransportControls {...baseProps()} speed={1.5} />)
  expect(screen.getByRole('button', { name: 'Playback speed' })).toHaveTextContent('1.5×')
})
