import '@testing-library/jest-dom'

// Node.js v22+ exposes a native localStorage backed by --localstorage-file.
// When vitest runs without a valid file path the native localStorage object
// throws on every call.  Override it here with jsdom's in-memory Storage so
// that tests which call localStorage.setItem / getItem / clear work correctly.
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = String(value) },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
    get length() { return Object.keys(store).length },
    key: (index: number) => Object.keys(store)[index] ?? null,
  }
})()

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// jsdom does not implement matchMedia. Provide a default stub so components
// using useBreakpoint() don't throw in tests that don't care about
// responsive behavior. Defaults to "matches: true" for any query (i.e.
// desktop/`md`-and-up), matching what the existing test suite already
// assumes about layout. Tests that specifically exercise mobile behavior
// override window.matchMedia locally.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

// jsdom does not implement ResizeObserver either (used by AudioPlayer to
// measure its own height for the shared --player-h CSS var). A no-op stub
// is sufficient for tests that don't specifically assert on it.
if (typeof window.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}
