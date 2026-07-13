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

// jsdom implements neither URL.createObjectURL/revokeObjectURL nor real
// media loading (used by EpisodeFormPanel to auto-detect audio duration).
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = () => 'blob:mock-url'
}
if (typeof URL.revokeObjectURL === 'undefined') {
  URL.revokeObjectURL = () => {}
}

// jsdom never fires loadedmetadata/durationchange/error on <audio> — setting
// `.src` is a no-op as far as events go. Any code awaiting one of those
// events (EpisodeFormPanel's duration auto-detection) would otherwise hang
// for the full length of its own internal timeout on every test run. Patch
// the src setter to fire `error` asynchronously by default, matching jsdom's
// real inability to load audio. Tests that need control over the resolved
// duration (EpisodeFormPanel.test.tsx) replace window.Audio wholesale via
// vi.stubGlobal, which bypasses this prototype patch entirely.
const mediaSrcDescriptor = Object.getOwnPropertyDescriptor(window.HTMLMediaElement.prototype, 'src')
if (mediaSrcDescriptor?.set) {
  Object.defineProperty(window.HTMLMediaElement.prototype, 'src', {
    ...mediaSrcDescriptor,
    set(this: HTMLMediaElement, value: string) {
      mediaSrcDescriptor.set!.call(this, value)
      setTimeout(() => this.dispatchEvent(new Event('error')), 0)
    },
  })
}
