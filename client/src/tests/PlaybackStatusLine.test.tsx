import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import PlaybackStatusLine from '../components/PlaybackStatusLine'

describe('PlaybackStatusLine', () => {
  it('is always mounted (present in the DOM) even with no status', () => {
    // The whole point of this component is to reserve layout space
    // regardless of status — a conditionally-rendered element defeats that
    // (this was the actual bug: content shifting as the line mounted and
    // unmounted).
    render(<PlaybackStatusLine status={null} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('is invisible (opacity-0) but still present with no status', () => {
    render(<PlaybackStatusLine status={null} />)
    expect(screen.getByRole('status')).toHaveClass('opacity-0')
  })

  it('becomes visible and shows the message text when a status is given', () => {
    render(<PlaybackStatusLine status={{ tone: 'neutral', text: 'Buffering…' }} />)
    const el = screen.getByRole('status')
    expect(el).toHaveClass('opacity-100')
    expect(el).toHaveTextContent('Buffering…')
  })

  it('uses error styling for tone: error', () => {
    render(<PlaybackStatusLine status={{ tone: 'error', text: 'Playback interrupted — tap retry.' }} />)
    expect(screen.getByRole('status')).toHaveClass('text-red-500')
  })

  it('uses neutral styling for tone: neutral', () => {
    render(<PlaybackStatusLine status={{ tone: 'neutral', text: 'Buffering…' }} />)
    const el = screen.getByRole('status')
    expect(el).toHaveClass('text-zinc-400')
    expect(el).not.toHaveClass('text-red-500')
  })

  it('reserves a min-height matching the requested size', () => {
    const { rerender } = render(<PlaybackStatusLine status={null} size="xs" />)
    expect(screen.getByRole('status')).toHaveClass('min-h-[1rem]')
    rerender(<PlaybackStatusLine status={null} size="sm" />)
    expect(screen.getByRole('status')).toHaveClass('min-h-[1.25rem]')
  })

  it('defaults to size sm when unspecified', () => {
    render(<PlaybackStatusLine status={null} />)
    expect(screen.getByRole('status')).toHaveClass('min-h-[1.25rem]')
  })
})
