/**
 * Inject face for the pet-grooming homepage.
 */

import type { PetshopHomeBookOutcome, PetshopHomeDraft } from './booking.ts'

/** Homepage posts bookings through this callback, not a Connection handle. */
export interface PetshopHomeInjected {
  /**
   * Send one booking to the hub and wait for the store ack.
   * @param draft - form fields after local validation.
   * @returns success with row id, or a failure message.
   */
  book: (draft: PetshopHomeDraft) => Promise<PetshopHomeBookOutcome>
}
