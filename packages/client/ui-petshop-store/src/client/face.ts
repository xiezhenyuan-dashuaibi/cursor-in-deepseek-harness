/**
 * Inject face for the booking-ledger overlay panel.
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { PetshopStoreList } from '../wire.ts'

/** Live sqlite rows from `/petshop-store` `list`. */
export interface PetshopStoreInjected {
  hooks: {
    /** Current ledger snapshot. */
    ledger: HostObservable<PetshopStoreList>
  }
}
