/**
 * Booking-ledger wire types and `/petshop-store` channel constants.
 * The browser half copies this module; it has no Node imports.
 */

/** Absolute Connection RPC channel for the booking ledger. */
export const PETSHOP_STORE_RPC_CHANNEL = '/petshop-store'

/** Channel-relative list endpoint. */
export const PETSHOP_STORE_LIST_ENDPOINT = 'list'

/** Grooming packages the homepage may book. */
export const PETSHOP_PACKAGE_IDS = ['bath', 'cut', 'full'] as const

/** Same-day slots the homepage may pick. */
export const PETSHOP_SLOT_IDS = ['10:00', '11:30', '14:00', '16:30', '19:00'] as const

/** One grooming package id. */
export type PetshopPackageId = (typeof PETSHOP_PACKAGE_IDS)[number]

/** One seating time. */
export type PetshopSlotId = (typeof PETSHOP_SLOT_IDS)[number]

/** Fields the hub supplies when inserting a booking. */
export interface PetshopBookingDraft {
  /** Dog's call name. */
  dogName: string
  /** Breed or mix label. */
  breed: string
  /** Owner display name. */
  owner: string
  /** Mainland mobile number. */
  phone: string
  /** Chosen package. */
  packageId: PetshopPackageId
  /** Chosen slot. */
  slot: PetshopSlotId
}

/** Persisted booking row returned to the ledger panel. */
export interface PetshopBookingRow extends PetshopBookingDraft {
  /** Opaque row id. */
  id: string
  /** ISO-8601 insert time. */
  createdAt: string
}

/** `list` success payload. */
export interface PetshopStoreList {
  /** Rows newest first. */
  rows: PetshopBookingRow[]
}

/**
 * Narrow a value to a package id.
 * @param value - wire value.
 * @returns the id, or undefined.
 */
export function asPetshopPackageId(value: unknown): PetshopPackageId | undefined {
  return PETSHOP_PACKAGE_IDS.find(id => id === value)
}

/**
 * Narrow a value to a slot id.
 * @param value - wire value.
 * @returns the id, or undefined.
 */
export function asPetshopSlotId(value: unknown): PetshopSlotId | undefined {
  return PETSHOP_SLOT_IDS.find(id => id === value)
}

/**
 * Narrow one persisted booking row.
 * @param value - wire value.
 * @returns the row, or undefined.
 */
export function asPetshopBookingRow(value: unknown): PetshopBookingRow | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const rec = value as Record<string, unknown>
  const packageId = asPetshopPackageId(rec.packageId)
  const slot = asPetshopSlotId(rec.slot)
  if (packageId === undefined || slot === undefined) return undefined
  if (typeof rec.id !== 'string' || rec.id.length === 0) return undefined
  if (typeof rec.createdAt !== 'string' || rec.createdAt.length === 0) return undefined
  if (typeof rec.dogName !== 'string' || rec.dogName.length === 0) return undefined
  if (typeof rec.breed !== 'string' || rec.breed.length === 0) return undefined
  if (typeof rec.owner !== 'string' || rec.owner.length === 0) return undefined
  if (typeof rec.phone !== 'string' || rec.phone.length === 0) return undefined
  return {
    id: rec.id,
    createdAt: rec.createdAt,
    dogName: rec.dogName,
    breed: rec.breed,
    owner: rec.owner,
    phone: rec.phone,
    packageId,
    slot,
  }
}

/**
 * Narrow a `list` payload.
 * @param value - RPC success value.
 * @returns the list, or undefined.
 */
export function asPetshopStoreList(value: unknown): PetshopStoreList | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const rows = (value as { rows?: unknown }).rows
  if (!Array.isArray(rows)) return undefined
  const parsed: PetshopBookingRow[] = []
  for (const row of rows) {
    const next = asPetshopBookingRow(row)
    if (next === undefined) return undefined
    parsed.push(next)
  }
  return { rows: parsed }
}
