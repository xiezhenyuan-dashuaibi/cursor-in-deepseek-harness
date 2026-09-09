/**
 * Marker `settings.onboarding` occupant. The settings shell skips every
 * first-run step when this entry's id is on the ledger, so this component
 * is a registration token and paints nothing.
 */

/** Id the settings-shell coordinator treats as "mount no onboarding step". */
export const CURSOR_OVERLAY_SKIP_ONBOARDING_ID = 'cursor-overlay-skip'

/**
 * Empty onboarding occupant used only as a ledger marker.
 * @returns null.
 */
export function SkipOnboarding(): null {
  return null
}
