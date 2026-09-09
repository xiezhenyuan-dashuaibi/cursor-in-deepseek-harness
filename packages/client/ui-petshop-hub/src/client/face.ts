/**
 * Inject face for the booking-hub overlay panel.
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { PetshopHubSignals } from '../wire.ts'

/** Live signal snapshot from `/petshop-hub` `signals`. */
export interface PetshopHubInjected {
  hooks: {
    /** Current detection snapshot. */
    signals: HostObservable<PetshopHubSignals>
  }
}
