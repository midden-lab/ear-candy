import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SeasonTabs from '../components/SeasonTabs'
import type { Season } from '../types'

const seasons: Season[] = [
  { id: 1, number: 1, title: 'Season One', description: '', cover_art_path: null, hidden: false, created_at: '2024-01-01T00:00:00Z' },
  { id: 2, number: 2, title: 'Season Two', description: '', cover_art_path: null, hidden: false, created_at: '2024-06-01T00:00:00Z' },
]

it('renders season titles as buttons', () => {
  render(<SeasonTabs seasons={seasons} activeSeason={null} onSelect={() => {}} />)
  expect(screen.getByRole('button', { name: 'Season One' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Season Two' })).toBeInTheDocument()
})

it('clicking a season calls onSelect with its id', async () => {
  const user = userEvent.setup()
  const onSelect = vi.fn()
  render(<SeasonTabs seasons={seasons} activeSeason={null} onSelect={onSelect} />)
  await user.click(screen.getByRole('button', { name: 'Season Two' }))
  expect(onSelect).toHaveBeenCalledWith(2)
})

it('active season button has aria-selected=true', () => {
  render(<SeasonTabs seasons={seasons} activeSeason={1} onSelect={() => {}} />)
  expect(screen.getByRole('button', { name: 'Season One' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('button', { name: 'Season Two' })).toHaveAttribute('aria-selected', 'false')
})
