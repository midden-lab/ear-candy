import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PrivacyNotice from '../components/PrivacyNotice'

it('renders a collapsed disclosure when analytics is enabled', () => {
  render(<PrivacyNotice analyticsEnabled={true} onAdminClick={() => {}} />)
  expect(screen.getByText('Anonymous listening analytics')).toBeInTheDocument()
  expect(screen.getByText(/anonymously tracks page views and playback/)).toBeInTheDocument()
})

it('omits the disclosure but still renders Admin when analytics is disabled', () => {
  render(<PrivacyNotice analyticsEnabled={false} onAdminClick={() => {}} />)
  expect(screen.queryByText('Anonymous listening analytics')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Admin' })).toBeInTheDocument()
})

it('calls onAdminClick when Admin is clicked, regardless of analytics state', async () => {
  const user = userEvent.setup()
  const onAdminClick = vi.fn()
  render(<PrivacyNotice analyticsEnabled={true} onAdminClick={onAdminClick} />)
  await user.click(screen.getByRole('button', { name: 'Admin' }))
  expect(onAdminClick).toHaveBeenCalledTimes(1)
})
