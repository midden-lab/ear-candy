import { render, screen } from '@testing-library/react'
import PillBadge from '../components/PillBadge'

it('renders label text', () => {
  render(<PillBadge label="interview" />)
  expect(screen.getByText('interview')).toBeInTheDocument()
})

it('applies additional className', () => {
  render(<PillBadge label="news" className="bg-blue-500 text-white" />)
  const badge = screen.getByText('news')
  expect(badge).toHaveClass('bg-blue-500')
  expect(badge).toHaveClass('text-white')
})
