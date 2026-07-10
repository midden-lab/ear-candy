import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import ProgressBar from '../components/ProgressBar'

it('renders an input range with aria-label "Seek"', () => {
  render(<ProgressBar currentTime={0} duration={100} onSeek={vi.fn()} />)
  expect(screen.getByRole('slider', { name: 'Seek' })).toBeInTheDocument()
})

it('has correct value and max props', () => {
  render(<ProgressBar currentTime={30} duration={120} onSeek={vi.fn()} />)
  const input = screen.getByRole('slider', { name: 'Seek' }) as HTMLInputElement
  expect(input.value).toBe('30')
  expect(input.max).toBe('120')
})

it('uses 1 as max when duration is 0', () => {
  render(<ProgressBar currentTime={0} duration={0} onSeek={vi.fn()} />)
  const input = screen.getByRole('slider', { name: 'Seek' }) as HTMLInputElement
  expect(input.max).toBe('1')
})

it('calls onSeek with the numeric value on change', () => {
  const onSeek = vi.fn()
  render(<ProgressBar currentTime={0} duration={100} onSeek={onSeek} />)
  const input = screen.getByRole('slider', { name: 'Seek' })
  fireEvent.change(input, { target: { value: '42' } })
  expect(onSeek).toHaveBeenCalledWith(42)
})
