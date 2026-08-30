interface PrivacyNoticeProps {
  analyticsEnabled: boolean
}

/**
 * The only in-app disclosure that anonymous analytics (including a
 * persistent cross-session identifier when "track returning listeners" is
 * on) is collected — previously documented only in README.md, which
 * listeners never see (issue tracked in the red-team report as PRIV-2).
 * Collapsed by default so it doesn't compete with the episode list; renders
 * nothing when analytics is administratively disabled.
 */
export default function PrivacyNotice({ analyticsEnabled }: PrivacyNoticeProps) {
  if (!analyticsEnabled) return null

  return (
    <details className="shrink-0 border-t border-zinc-200 px-4 py-2.5 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
      <summary className="cursor-pointer select-none">
        Anonymous listening analytics
      </summary>
      <p className="mt-2 leading-relaxed">
        This site anonymously tracks page views and playback — episode, device/browser type, and a
        country resolved from your IP address, which is never stored. No data is shared with or sent
        to any third party.
      </p>
    </details>
  )
}
