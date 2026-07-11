import { render, screen } from '@testing-library/react'
import { afterEach } from 'vitest'
import AppShell from '../components/AppShell'

const originalMatchMedia = window.matchMedia

function mockMobile() {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

afterEach(() => {
  window.matchMedia = originalMatchMedia
})

it('renders rail, sidebar, and detail content', () => {
  render(
    <AppShell
      rail={<div>Rail Content</div>}
      sidebar={<div>Sidebar Content</div>}
      detail={<div>Detail Content</div>}
    />
  )
  expect(screen.getByText('Rail Content')).toBeInTheDocument()
  expect(screen.getByText('Sidebar Content')).toBeInTheDocument()
  expect(screen.getByText('Detail Content')).toBeInTheDocument()
})

it('renders rail content inside an aside', () => {
  render(
    <AppShell
      rail={<div>Rail Content</div>}
      sidebar={<div>Sidebar Content</div>}
      detail={<div>Detail Content</div>}
    />
  )
  const aside = document.querySelector('aside')
  expect(aside).not.toBeNull()
  expect(aside).toHaveTextContent('Rail Content')
})

it('renders sidebar content inside the aside', () => {
  render(
    <AppShell
      rail={<div>Rail Content</div>}
      sidebar={<div>Sidebar Content</div>}
      detail={<div>Detail Content</div>}
    />
  )
  const aside = document.querySelector('aside')
  expect(aside).toHaveTextContent('Sidebar Content')
})

it('renders detail content inside main', () => {
  render(
    <AppShell
      rail={<div>Rail Content</div>}
      sidebar={<div>Sidebar Content</div>}
      detail={<div>Detail Content</div>}
    />
  )
  const main = document.querySelector('main')
  expect(main).not.toBeNull()
  expect(main).toHaveTextContent('Detail Content')
})

it('renders themeBadge when provided', () => {
  render(
    <AppShell
      rail={<div>Rail Content</div>}
      sidebar={<div>Sidebar Content</div>}
      detail={<div>Detail Content</div>}
      themeBadge={<div>Theme Badge</div>}
    />
  )
  expect(screen.getByText('Theme Badge')).toBeInTheDocument()
})

it('renders themeBadge in fixed bottom-right position', () => {
  render(
    <AppShell
      rail={<div>Rail Content</div>}
      sidebar={<div>Sidebar Content</div>}
      detail={<div>Detail Content</div>}
      themeBadge={<div>Theme Badge</div>}
    />
  )
  const badgeContainer = document.querySelector('.fixed.bottom-4.right-4.z-50')
  expect(badgeContainer).not.toBeNull()
  expect(badgeContainer).toHaveTextContent('Theme Badge')
})

describe('mobile layout (< md)', () => {
  it('shows only the mobile header + sidebar when focusedPane is "list", not detail or the desktop aside', () => {
    mockMobile()
    render(
      <AppShell
        rail={<div>Rail Content</div>}
        mobileHeader={<div>Mobile Header</div>}
        sidebar={<div>Sidebar Content</div>}
        detail={<div>Detail Content</div>}
        focusedPane="list"
      />
    )
    expect(screen.getByText('Mobile Header')).toBeInTheDocument()
    expect(screen.getByText('Sidebar Content')).toBeInTheDocument()
    expect(screen.queryByText('Detail Content')).not.toBeInTheDocument()
    expect(screen.queryByText('Rail Content')).not.toBeInTheDocument()
    expect(document.querySelector('aside')).toBeNull()
  })

  it('shows only detail (no mobile header, no sidebar) when focusedPane is "detail"', () => {
    mockMobile()
    render(
      <AppShell
        rail={<div>Rail Content</div>}
        mobileHeader={<div>Mobile Header</div>}
        sidebar={<div>Sidebar Content</div>}
        detail={<div>Detail Content</div>}
        focusedPane="detail"
      />
    )
    expect(screen.getByText('Detail Content')).toBeInTheDocument()
    expect(screen.queryByText('Sidebar Content')).not.toBeInTheDocument()
    expect(screen.queryByText('Mobile Header')).not.toBeInTheDocument()
  })

  it('does not render the floating themeBadge on mobile (it lives in the mobile header instead)', () => {
    mockMobile()
    render(
      <AppShell
        rail={<div>Rail Content</div>}
        mobileHeader={<div>Mobile Header</div>}
        sidebar={<div>Sidebar Content</div>}
        detail={<div>Detail Content</div>}
        themeBadge={<div>Theme Badge</div>}
        focusedPane="list"
      />
    )
    expect(document.querySelector('.fixed.bottom-4.right-4.z-50')).toBeNull()
  })

  it('moves focus to the main content region when focusedPane changes', () => {
    mockMobile()
    const { rerender } = render(
      <AppShell
        rail={<div>Rail Content</div>}
        mobileHeader={<div>Mobile Header</div>}
        sidebar={<div>Sidebar Content</div>}
        detail={<div>Detail Content</div>}
        focusedPane="list"
      />
    )
    rerender(
      <AppShell
        rail={<div>Rail Content</div>}
        mobileHeader={<div>Mobile Header</div>}
        sidebar={<div>Sidebar Content</div>}
        detail={<div>Detail Content</div>}
        focusedPane="detail"
      />
    )
    expect(document.querySelector('main')).toHaveFocus()
  })
})
