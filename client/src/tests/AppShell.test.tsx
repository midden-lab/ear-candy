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

it('renders masthead, sidebar, and detail content', () => {
  render(
    <AppShell
      masthead={<div>Masthead Content</div>}
      sidebar={<div>Sidebar Content</div>}
      detail={<div>Detail Content</div>}
    />
  )
  expect(screen.getByText('Masthead Content')).toBeInTheDocument()
  expect(screen.getByText('Sidebar Content')).toBeInTheDocument()
  expect(screen.getByText('Detail Content')).toBeInTheDocument()
})

it('has a light-mode page background with a dark: override, not a dark-only class', () => {
  const { container } = render(
    <AppShell
      masthead={<div>Masthead Content</div>}
      sidebar={<div>Sidebar Content</div>}
      detail={<div>Detail Content</div>}
    />
  )
  const root = container.firstChild as HTMLElement
  expect(root.className).toContain('bg-zinc-50')
  expect(root.className).toContain('dark:bg-zinc-950')
})

it('aside reserves the same bottom padding as main for the fixed player bar', () => {
  render(
    <AppShell
      masthead={<div>Masthead Content</div>}
      sidebar={<div>Sidebar Content</div>}
      detail={<div>Detail Content</div>}
    />
  )
  const aside = document.querySelector('aside')
  const main = document.querySelector('main')
  expect(aside?.style.paddingBottom).toBe(main?.style.paddingBottom)
  expect(aside?.style.paddingBottom).toContain('var(--player-h')
})

it('renders masthead content outside of main and aside, above both', () => {
  render(
    <AppShell
      masthead={<div>Masthead Content</div>}
      sidebar={<div>Sidebar Content</div>}
      detail={<div>Detail Content</div>}
    />
  )
  const main = document.querySelector('main')
  const aside = document.querySelector('aside')
  expect(main).not.toHaveTextContent('Masthead Content')
  expect(aside).not.toHaveTextContent('Masthead Content')
  expect(screen.getByText('Masthead Content')).toBeInTheDocument()
})

it('renders detail content inside main (main is the primary/left pane)', () => {
  render(
    <AppShell
      masthead={<div>Masthead Content</div>}
      sidebar={<div>Sidebar Content</div>}
      detail={<div>Detail Content</div>}
    />
  )
  const main = document.querySelector('main')
  expect(main).not.toBeNull()
  expect(main).toHaveTextContent('Detail Content')
})

it('renders sidebar content inside an aside (the secondary/right pane)', () => {
  render(
    <AppShell
      masthead={<div>Masthead Content</div>}
      sidebar={<div>Sidebar Content</div>}
      detail={<div>Detail Content</div>}
    />
  )
  const aside = document.querySelector('aside')
  expect(aside).not.toBeNull()
  expect(aside).toHaveTextContent('Sidebar Content')
})

it('places the aside after main in DOM order (right-hand sidebar)', () => {
  render(
    <AppShell
      masthead={<div>Masthead Content</div>}
      sidebar={<div>Sidebar Content</div>}
      detail={<div>Detail Content</div>}
    />
  )
  const main = document.querySelector('main')
  const aside = document.querySelector('aside')
  expect(main?.compareDocumentPosition(aside!) ?? 0).toBeTruthy()
  expect(
    (main?.compareDocumentPosition(aside!) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
})

describe('mobile layout (< md)', () => {
  it('shows only the tab bar + sidebar when focusedPane is "list", not detail, settings, or the desktop aside', () => {
    mockMobile()
    render(
      <AppShell
        masthead={<div>Masthead Content</div>}
        sidebar={<div>Sidebar Content</div>}
        detail={<div>Detail Content</div>}
        settings={<div>Settings Content</div>}
        tabBar={<div>Tab Bar</div>}
        focusedPane="list"
      />
    )
    expect(screen.getByText('Tab Bar')).toBeInTheDocument()
    expect(screen.getByText('Sidebar Content')).toBeInTheDocument()
    expect(screen.queryByText('Detail Content')).not.toBeInTheDocument()
    expect(screen.queryByText('Settings Content')).not.toBeInTheDocument()
    expect(document.querySelector('aside')).toBeNull()
  })

  it('shows only detail (no sidebar, no settings) when focusedPane is "detail"', () => {
    mockMobile()
    render(
      <AppShell
        masthead={<div>Masthead Content</div>}
        sidebar={<div>Sidebar Content</div>}
        detail={<div>Detail Content</div>}
        settings={<div>Settings Content</div>}
        tabBar={<div>Tab Bar</div>}
        focusedPane="detail"
      />
    )
    expect(screen.getByText('Detail Content')).toBeInTheDocument()
    expect(screen.queryByText('Sidebar Content')).not.toBeInTheDocument()
    expect(screen.queryByText('Settings Content')).not.toBeInTheDocument()
  })

  it('shows only settings (no sidebar, no detail) when focusedPane is "settings"', () => {
    mockMobile()
    render(
      <AppShell
        masthead={<div>Masthead Content</div>}
        sidebar={<div>Sidebar Content</div>}
        detail={<div>Detail Content</div>}
        settings={<div>Settings Content</div>}
        tabBar={<div>Tab Bar</div>}
        focusedPane="settings"
      />
    )
    expect(screen.getByText('Settings Content')).toBeInTheDocument()
    expect(screen.queryByText('Sidebar Content')).not.toBeInTheDocument()
    expect(screen.queryByText('Detail Content')).not.toBeInTheDocument()
  })

  it('renders the tab bar on every mobile pane (list, detail, and settings)', () => {
    mockMobile()
    const { rerender } = render(
      <AppShell
        masthead={<div>Masthead Content</div>}
        sidebar={<div>Sidebar Content</div>}
        detail={<div>Detail Content</div>}
        settings={<div>Settings Content</div>}
        tabBar={<div>Tab Bar</div>}
        focusedPane="list"
      />
    )
    expect(screen.getByText('Tab Bar')).toBeInTheDocument()
    rerender(
      <AppShell
        masthead={<div>Masthead Content</div>}
        sidebar={<div>Sidebar Content</div>}
        detail={<div>Detail Content</div>}
        settings={<div>Settings Content</div>}
        tabBar={<div>Tab Bar</div>}
        focusedPane="detail"
      />
    )
    expect(screen.getByText('Tab Bar')).toBeInTheDocument()
  })

  it('renders the masthead on every mobile pane too (list, detail, and settings)', () => {
    mockMobile()
    const { rerender } = render(
      <AppShell
        masthead={<div>Masthead Content</div>}
        sidebar={<div>Sidebar Content</div>}
        detail={<div>Detail Content</div>}
        settings={<div>Settings Content</div>}
        focusedPane="list"
      />
    )
    expect(screen.getByText('Masthead Content')).toBeInTheDocument()
    rerender(
      <AppShell
        masthead={<div>Masthead Content</div>}
        sidebar={<div>Sidebar Content</div>}
        detail={<div>Detail Content</div>}
        settings={<div>Settings Content</div>}
        focusedPane="settings"
      />
    )
    expect(screen.getByText('Masthead Content')).toBeInTheDocument()
  })

  it('does not render the tab bar on desktop', () => {
    render(
      <AppShell
        masthead={<div>Masthead Content</div>}
        sidebar={<div>Sidebar Content</div>}
        detail={<div>Detail Content</div>}
        tabBar={<div>Tab Bar</div>}
      />
    )
    expect(screen.queryByText('Tab Bar')).not.toBeInTheDocument()
  })

  it('moves focus to the main content region when focusedPane changes', () => {
    mockMobile()
    const { rerender } = render(
      <AppShell
        masthead={<div>Masthead Content</div>}
        sidebar={<div>Sidebar Content</div>}
        detail={<div>Detail Content</div>}
        focusedPane="list"
      />
    )
    rerender(
      <AppShell
        masthead={<div>Masthead Content</div>}
        sidebar={<div>Sidebar Content</div>}
        detail={<div>Detail Content</div>}
        focusedPane="detail"
      />
    )
    expect(document.querySelector('main')).toHaveFocus()
  })
})
