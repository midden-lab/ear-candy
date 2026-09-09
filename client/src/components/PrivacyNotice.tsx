import { useBreakpoint, MD_BREAKPOINT_QUERY } from '../hooks/useBreakpoint'

interface PrivacyNoticeProps {
  analyticsEnabled: boolean
  onAdminClick: () => void
}

/**
 * The analytics disclosure that anonymous analytics (including a persistent
 * cross-session identifier when "track returning listeners" is on) is
 * collected — previously documented only in README.md, which listeners
 * never see (issue tracked in the red-team report as PRIV-2). Collapsed by
 * default so it doesn't compete with the episode list; renders nothing when
 * analytics is administratively disabled.
 *
 * Also hosts the Admin entry point on the same row, unconditionally —
 * previously duplicated between the desktop masthead and the mobile
 * Settings tab, consolidated to this one location on both breakpoints so
 * Admin doesn't disappear when analytics happens to be off.
 */
export default function PrivacyNotice({ analyticsEnabled, onAdminClick }: PrivacyNoticeProps) {
  const isDesktop = useBreakpoint(MD_BREAKPOINT_QUERY)

  return (
    <div className={isDesktop ? 'analytics-row' : 'analytics-row m-analytics-row'}>
      {analyticsEnabled && (
        <details className={isDesktop ? 'analytics' : 'analytics m-analytics'}>
          <summary>Anonymous listening analytics</summary>
          <p>
            This site anonymously tracks page views and playback. This includes the episode,
            device/browser type, and a country resolved from your IP address, which is never stored.
            No data is shared with or sent to any third party.
          </p>
        </details>
      )}
      <button type="button" onClick={onAdminClick} className="admin-link">Admin</button>
    </div>
  )
}
