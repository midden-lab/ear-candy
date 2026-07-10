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
