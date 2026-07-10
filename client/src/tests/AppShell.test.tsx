import { render, screen } from '@testing-library/react'
import AppShell from '../components/AppShell'

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
