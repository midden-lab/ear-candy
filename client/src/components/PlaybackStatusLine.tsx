import type { PlaybackStatus } from '../utils/playbackStatus'

interface PlaybackStatusLineProps {
  status: PlaybackStatus | null
  /** `sm` (DetailPane, mobile full-screen overlay) vs `xs` (the more
   *  compact desktop player bar) — bundles the text-size utility with a
   *  matching reserved min-height so the two always agree; passing size and
   *  height as separate props risked the two drifting out of sync. */
  size?: 'xs' | 'sm'
  className?: string
}

const SIZE_CLASSES: Record<NonNullable<PlaybackStatusLineProps['size']>, string> = {
  xs: 'text-xs min-h-[1rem]',
  sm: 'text-sm min-h-[1.25rem]',
}

/**
 * Always-mounted status line reserving a fixed one-line height, so a
 * buffering/error message appearing or disappearing never shifts
 * surrounding layout — conditionally rendering (or removing) the element
 * itself was found to visibly push page content down when buffering
 * started and back up when it finished. Content fades via opacity instead
 * of mount/unmount; a single space keeps the line's height identical
 * whether or not there's real text in it.
 */
export default function PlaybackStatusLine({ status, size = 'sm', className }: PlaybackStatusLineProps) {
  return (
    <p
      role="status"
      className={`${SIZE_CLASSES[size]} font-mono uppercase tracking-widest transition-opacity duration-150 ease-quiet ${status ? 'opacity-100' : 'opacity-0'} ${
        status?.tone === 'error' ? 'text-red-500 dark:text-red-400' : 'text-ink-3'
      } ${className ?? ''}`}
    >
      {status?.text ?? ' '}
    </p>
  )
}
