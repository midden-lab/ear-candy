import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SeasonPicker from '../components/SeasonPicker'
import type { Season } from '../types'

const seasons: Season[] = [
  { id: 1, number: 1, title: 'Season One', description: '', cover_art_path: null, hidden: false, created_at: '2024-01-01T00:00:00Z' },
  { id: 2, number: 2, title: 'Season Two', description: '', cover_art_path: null, hidden: false, created_at: '2024-06-01T00:00:00Z' },
]

afterEach(() => {
  document.body.style.overflow = ''
})

it('shows the active season title on the closed trigger, and no dialog yet', () => {
  render(<SeasonPicker seasons={seasons} activeSeason={2} onSelect={() => {}} />)
  expect(screen.getByRole('button', { name: /Season Two/ })).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('opens a full-screen dialog on tap, listing every season', async () => {
  const user = userEvent.setup()
  render(<SeasonPicker seasons={seasons} activeSeason={1} onSelect={() => {}} />)
  await user.click(screen.getByRole('button', { name: /Season One/ }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByRole('option', { name: /Season One/ })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('option', { name: /Season Two/ })).toHaveAttribute('aria-selected', 'false')
})

it('shows each season\'s episode count', async () => {
  const user = userEvent.setup()
  render(<SeasonPicker seasons={seasons} activeSeason={1} episodeCounts={{ 1: 14, 2: 22 }} onSelect={() => {}} />)
  await user.click(screen.getByRole('button', { name: /Season One/ }))
  expect(screen.getByRole('option', { name: /Season One/ })).toHaveTextContent('14')
  expect(screen.getByRole('option', { name: /Season Two/ })).toHaveTextContent('22')
})

it('selecting a season calls onSelect and closes the dialog', async () => {
  const user = userEvent.setup()
  const onSelect = vi.fn()
  render(<SeasonPicker seasons={seasons} activeSeason={1} onSelect={onSelect} />)
  await user.click(screen.getByRole('button', { name: /Season One/ }))
  await user.click(screen.getByRole('option', { name: /Season Two/ }))
  expect(onSelect).toHaveBeenCalledWith(2)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('the close button closes the dialog without selecting', async () => {
  const user = userEvent.setup()
  const onSelect = vi.fn()
  render(<SeasonPicker seasons={seasons} activeSeason={1} onSelect={onSelect} />)
  await user.click(screen.getByRole('button', { name: /Season One/ }))
  await user.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(onSelect).not.toHaveBeenCalled()
})

it('pressing Escape closes the dialog without selecting', async () => {
  const user = userEvent.setup()
  const onSelect = vi.fn()
  render(<SeasonPicker seasons={seasons} activeSeason={1} onSelect={onSelect} />)
  await user.click(screen.getByRole('button', { name: /Season One/ }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(onSelect).not.toHaveBeenCalled()
})

it('locks body scroll while open and restores it on close', async () => {
  const user = userEvent.setup()
  render(<SeasonPicker seasons={seasons} activeSeason={1} onSelect={() => {}} />)
  expect(document.body.style.overflow).not.toBe('hidden')
  await user.click(screen.getByRole('button', { name: /Season One/ }))
  expect(document.body.style.overflow).toBe('hidden')
  await user.keyboard('{Escape}')
  expect(document.body.style.overflow).not.toBe('hidden')
})

it('renders nothing when there are no seasons', () => {
  const { container } = render(<SeasonPicker seasons={[]} activeSeason={null} onSelect={() => {}} />)
  expect(container).toBeEmptyDOMElement()
})
