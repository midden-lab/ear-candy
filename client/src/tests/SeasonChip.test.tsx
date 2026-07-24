import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SeasonChip from '../components/SeasonChip'
import type { Season } from '../types'

const seasons: Season[] = [
  { id: 1, number: 1, title: 'Season One', description: '', cover_art_path: null, hidden: false, created_at: '2024-01-01T00:00:00Z' },
  { id: 2, number: 2, title: 'Season Two', description: '', cover_art_path: null, hidden: false, created_at: '2024-06-01T00:00:00Z' },
]

it('shows the active season title on the closed chip', () => {
  render(<SeasonChip seasons={seasons} activeSeason={2} onSelect={() => {}} />)
  expect(screen.getByRole('button', { name: /Season Two/ })).toBeInTheDocument()
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})

it('opens the listbox on tap, showing all seasons', async () => {
  const user = userEvent.setup()
  render(<SeasonChip seasons={seasons} activeSeason={1} onSelect={() => {}} />)
  await user.click(screen.getByRole('button', { name: /Season One/ }))
  expect(screen.getByRole('listbox')).toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'Season One' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('option', { name: 'Season Two' })).toHaveAttribute('aria-selected', 'false')
})

it('selecting a season calls onSelect and closes the listbox', async () => {
  const user = userEvent.setup()
  const onSelect = vi.fn()
  render(<SeasonChip seasons={seasons} activeSeason={1} onSelect={onSelect} />)
  await user.click(screen.getByRole('button', { name: /Season One/ }))
  await user.click(screen.getByRole('option', { name: 'Season Two' }))
  expect(onSelect).toHaveBeenCalledWith(2)
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})

it('clicking outside closes the listbox without selecting', async () => {
  const user = userEvent.setup()
  const onSelect = vi.fn()
  render(
    <div>
      <SeasonChip seasons={seasons} activeSeason={1} onSelect={onSelect} />
      <button>outside</button>
    </div>
  )
  await user.click(screen.getByRole('button', { name: /Season One/ }))
  expect(screen.getByRole('listbox')).toBeInTheDocument()
  await user.click(screen.getByText('outside'))
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(onSelect).not.toHaveBeenCalled()
})

it('renders nothing when there are no seasons', () => {
  const { container } = render(<SeasonChip seasons={[]} activeSeason={null} onSelect={() => {}} />)
  expect(container).toBeEmptyDOMElement()
})
