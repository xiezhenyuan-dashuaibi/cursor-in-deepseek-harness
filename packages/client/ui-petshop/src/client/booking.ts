/**
 * Homepage booking payload and hub channel strings.
 * Duplicated on this client; do not import the hub package.
 */

/** Absolute Connection RPC channel for the booking hub. */
export const PETSHOP_HOME_HUB_CHANNEL = '/petshop-hub'

/** Channel-relative book endpoint. */
export const PETSHOP_HOME_BOOK_ENDPOINT = 'book'

/** Grooming packages offered on this page. */
export const PETSHOP_HOME_PACKAGE_IDS = ['bath', 'cut', 'full'] as const

/** Same-day slots offered on this page. */
export const PETSHOP_HOME_SLOT_IDS = ['10:00', '11:30', '14:00', '16:30', '19:00'] as const

/** One grooming package id. */
export type PetshopHomePackageId = (typeof PETSHOP_HOME_PACKAGE_IDS)[number]

/** One seating time. */
export type PetshopHomeSlotId = (typeof PETSHOP_HOME_SLOT_IDS)[number]

/** Fields posted to the hub `book` endpoint. */
export interface PetshopHomeDraft {
  /** Dog's call name. */
  dogName: string
  /** Breed or mix label. */
  breed: string
  /** Owner display name. */
  owner: string
  /** Mainland mobile number. */
  phone: string
  /** Chosen package. */
  packageId: PetshopHomePackageId
  /** Chosen slot. */
  slot: PetshopHomeSlotId
}

/** Homepage view of a successful hub ack. */
export interface PetshopHomeAck {
  /** Ledger row id. */
  id: string
  /** ISO-8601 insert time. */
  createdAt: string
}

/** Outcome of the injected `book` callback. */
export type PetshopHomeBookOutcome =
  | { ok: true; ack: PetshopHomeAck }
  | { ok: false; message: string }

/**
 * Narrow a hub `book` success value.
 * @param value - RPC success value.
 * @returns the ack, or undefined.
 */
export function asPetshopHomeAck(value: unknown): PetshopHomeAck | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const rec = value as Record<string, unknown>
  if (typeof rec.id !== 'string' || rec.id.length === 0) return undefined
  if (typeof rec.createdAt !== 'string' || rec.createdAt.length === 0) return undefined
  return { id: rec.id, createdAt: rec.createdAt }
}

/** Minimal RPC caller the homepage uses for `book`. */
export interface PetshopHomeRpc {
  /**
   * Call one endpoint on a dedicated channel.
   * @param channel - absolute channel.
   * @param endpoint - channel-relative method.
   * @param payload - JSON payload.
   * @param signal - optional cancellation.
   */
  call(
    channel: string,
    endpoint: string,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<{ ok: true; value: unknown } | { ok: false; error: { message: string } }>
}

/**
 * Post one booking to the hub and translate the RPC result for the page.
 * @param rpc - Connection generic RPC caller.
 * @param draft - locally validated form fields.
 * @returns success with row id, or a failure message.
 */
export async function postPetshopBooking(
  rpc: PetshopHomeRpc,
  draft: PetshopHomeDraft,
): Promise<PetshopHomeBookOutcome> {
  let result
  try {
    result = await rpc.call(PETSHOP_HOME_HUB_CHANNEL, PETSHOP_HOME_BOOK_ENDPOINT, draft)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, message }
  }
  if (!result.ok) return { ok: false, message: result.error.message }
  const ack = asPetshopHomeAck(result.value)
  if (ack === undefined) return { ok: false, message: 'petshop: hub ack rejected' }
  return { ok: true, ack }
}
