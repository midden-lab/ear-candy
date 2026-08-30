import { render, screen } from '@testing-library/react'
import PrivacyNotice from '../components/PrivacyNotice'

it('renders a collapsed disclosure when analytics is enabled', () => {
  render(<PrivacyNotice analyticsEnabled={true} />)
  expect(screen.getByText('Anonymous listening analytics')).toBeInTheDocument()
  expect(screen.getByText(/anonymously tracks page views and playback/)).toBeInTheDocument()
})

it('renders nothing when analytics is disabled', () => {
  const { container } = render(<PrivacyNotice analyticsEnabled={false} />)
  expect(container).toBeEmptyDOMElement()
})
