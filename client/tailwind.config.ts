import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        'ink-4': 'var(--ink-4)',
        hair: 'var(--hair)',
        wash: 'var(--wash)',
        ring: 'var(--ring)',
        'ring-2': 'var(--ring-2)',
        'scrub-track': 'var(--scrub-track)',
      },
      fontFamily: {
        sans: ['Archivo', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        art: 'var(--shadow-art)',
        row: 'var(--shadow-row)',
        dock: 'var(--shadow-dock)',
      },
      transitionTimingFunction: {
        quiet: 'var(--ease)',
      },
    },
  },
  plugins: []
} satisfies Config
