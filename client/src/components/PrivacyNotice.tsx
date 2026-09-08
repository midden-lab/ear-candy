import { useBreakpoint, MD_BREAKPOINT_QUERY } from '../hooks/useBreakpoint'

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
  const isDesktop = useBreakpoint(MD_BREAKPOINT_QUERY)

  if (!analyticsEnabled) return null

  return (
    <details className={isDesktop ? 'analytics' : 'analytics m-analytics'}>
      <summary>Anonymous listening analytics</summary>
      <p>
        This site anonymously tracks page views and playback. This includes the episode,
        device/browser type, and a country resolved from your IP address, which is never stored.
        No data is shared with or sent to any third party.
      </p>
    </details>
  )
}
