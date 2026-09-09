/**
 * Booking-hub wire types and `/petshop-hub` channel constants.
 * The browser half copies this module; it has no Node imports.
 */

/** Absolute Connection RPC channel for the booking hub. */
export const PETSHOP_HUB_RPC_CHANNEL = '/petshop-hub'

/** Channel-relative book endpoint. */
export const PETSHOP_HUB_BOOK_ENDPOINT = 'book'

/** Channel-relative signal log endpoint. */
export const PETSHOP_HUB_SIGNALS_ENDPOINT = 'signals'

/** Newest signals retained in memory. */
export const PETSHOP_HUB_SIGNALS_MAX = 40

/** Grooming packages the homepage may book. */
export const PETSHOP_HUB_PACKAGE_IDS = ['bath', 'cut', 'full'] as const

/** Same-day slots the homepage may pick. */
export const PETSHOP_HUB_SLOT_IDS = ['10:00', '11:30', '14:00', '16:30', '19:00'] as const

/** One grooming package id. */
export type PetshopHubPackageId = (typeof PETSHOP_HUB_PACKAGE_IDS)[number]

/** One seating time. */
export type PetshopHubSlotId = (typeof PETSHOP_HUB_SLOT_IDS)[number]

/** Booking fields the homepage posts to `book`. */
export interface PetshopHubDraft {
  /** Dog's call name. */
  dogName: string
  /** Breed or mix label. */
  breed: string
  /** Owner display name. */
  owner: string
  /** Mainland mobile number. */
  phone: string
  /** Chosen package. */
  packageId: PetshopHubPackageId
  /** Chosen slot. */
  slot: PetshopHubSlotId
}

/** Success payload returned to the homepage after sqlite insert. */
export interface PetshopHubAck {
  /** Ledger row id. */
  id: string
  /** ISO-8601 insert time. */
  createdAt: string
}

/** Pipeline stage recorded on the hub. */
export type PetshopHubStage = 'home-in' | 'store-out' | 'store-ok' | 'home-ack' | 'failed'

/** One detected hop. */
export interface PetshopHubSignal {
  /** Opaque signal id. */
  id: string
  /** ISO-8601 detection time. */
  at: string
  /** Pipeline stage. */
  stage: PetshopHubStage
  /** Short human detail. */
  detail: string
}

/** `signals` success payload. */
export interface PetshopHubSignals {
  /** Newest first. */
  signals: PetshopHubSignal[]
  /** Last recorded stage, or null before any traffic. */
  lastStage: PetshopHubStage | null
  /** Last failure detail when `lastStage` is `failed`. */
  lastError: string | null
}

const PHONE_RE = /^1[3-9]\d{9}$/

const STAGES: readonly PetshopHubStage[] = ['home-in', 'store-out', 'store-ok', 'home-ack', 'failed']

/**
 * Parse a homepage booking payload.
 * @param value - RPC payload.
 * @returns the draft, or undefined when rejected.
 */
export function parsePetshopHubDraft(value: unknown): PetshopHubDraft | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const rec = value as Record<string, unknown>
  const dogName = asNonemptyString(rec.dogName)
  const breed = asNonemptyString(rec.breed)
  const owner = asNonemptyString(rec.owner)
  const phone = asNonemptyString(rec.phone)
  const packageId = PETSHOP_HUB_PACKAGE_IDS.find(id => id === rec.packageId)
  const slot = PETSHOP_HUB_SLOT_IDS.find(id => id === rec.slot)
  if (
    dogName === undefined
    || breed === undefined
    || owner === undefined
    || phone === undefined
    || packageId === undefined
    || slot === undefined
  ) return undefined
  if (!PHONE_RE.test(phone)) return undefined
  return { dogName, breed, owner, phone, packageId, slot }
}

/**
 * Narrow a `book` ack.
 * @param value - RPC success value.
 * @returns the ack, or undefined.
 */
export function asPetshopHubAck(value: unknown): PetshopHubAck | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const rec = value as Record<string, unknown>
  if (typeof rec.id !== 'string' || rec.id.length === 0) return undefined
  if (typeof rec.createdAt !== 'string' || rec.createdAt.length === 0) return undefined
  return { id: rec.id, createdAt: rec.createdAt }
}

/**
 * Narrow a `signals` payload.
 * @param value - RPC success value.
 * @returns the snapshot, or undefined.
 */
export function asPetshopHubSignals(value: unknown): PetshopHubSignals | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const rec = value as Record<string, unknown>
  if (!Array.isArray(rec.signals)) return undefined
  const signals: PetshopHubSignal[] = []
  for (const item of rec.signals) {
    const signal = asSignal(item)
    if (signal === undefined) return undefined
    signals.push(signal)
  }
  let lastStage: PetshopHubStage | null
  if (rec.lastStage === null) {
    lastStage = null
  } else {
    const parsed = asStage(rec.lastStage)
    if (parsed === undefined) return undefined
    lastStage = parsed
  }
  let lastError: string | null
  if (rec.lastError === null) {
    lastError = null
  } else if (typeof rec.lastError === 'string') {
    lastError = rec.lastError
  } else {
    return undefined
  }
  return { signals, lastStage, lastError }
}

function asNonemptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

function asStage(value: unknown): PetshopHubStage | undefined {
  return STAGES.find(stage => stage === value)
}

function asSignal(value: unknown): PetshopHubSignal | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const rec = value as Record<string, unknown>
  const stage = asStage(rec.stage)
  if (stage === undefined) return undefined
  if (typeof rec.id !== 'string' || rec.id.length === 0) return undefined
  if (typeof rec.at !== 'string' || rec.at.length === 0) return undefined
  if (typeof rec.detail !== 'string') return undefined
  return { id: rec.id, at: rec.at, stage, detail: rec.detail }
}
