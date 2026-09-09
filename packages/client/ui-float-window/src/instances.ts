/**
 * Overlay-card roster: insert-time spec (title, unique id, opening size),
 * slot names, and file format shared by the host RPC reader, the browser
 * desk, and `overlay:live`.
 */

/** npm name of the reusable card package. `overlay:live` keys the Loader row by this. */
export const OVERLAY_CARD_PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-float-window'

/** Connection RPC channel the host half registers. */
export const OVERLAY_CARD_RPC_CHANNEL = '/overlay-card'

/**
 * Never-imported live channel for hide / insert writes when the first
 * {@link OVERLAY_CARD_RPC_CHANNEL} `apply` is still list-only.
 */
export const OVERLAY_CARD_PLUG_RPC_CHANNEL = '/overlay-card-plug'

/** Endpoint that returns {@link OverlayCardRoster}. */
export const OVERLAY_CARD_LIST_ENDPOINT = 'instances.list'

/** Endpoint that writes {@link OverlayCardSpec.hidden} and returns the roster. */
export const OVERLAY_CARD_SET_HIDDEN_ENDPOINT = 'instances.setHidden'

/** Endpoint that sets Loader `disabled` on this card's occupants. */
export const OVERLAY_CARD_SET_INSERTED_ENDPOINT = 'occupants.setInserted'

/** File name next to the live plugin `lib/` copy. Checkout keeps a one-card template; runtime reads the profile copy. */
export const OVERLAY_CARD_INSTANCES_FILE = 'instances.json'

/** Highest seat the desk predeclares slots for. */
export const OVERLAY_CARD_MAX = 8

/** Seats the desk may mount. */
export const OVERLAY_CARD_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8] as const

/** One allowed seat. */
export type OverlayCardNumber = (typeof OVERLAY_CARD_NUMBERS)[number]

/** Default title-bar name when `--title` is omitted. */
export const OVERLAY_CARD_DEFAULT_TITLE = '卡片'

/** Default opening width when `--width` is omitted (matches the card minimum). */
export const OVERLAY_CARD_DEFAULT_WIDTH = 360

/** Default opening height when `--height` is omitted (matches the card minimum). */
export const OVERLAY_CARD_DEFAULT_HEIGHT = 280

/** Unique id token accepted as `--card-id`, occupant Loader ids, and `overlay-card-<id>` remove. */
const CARD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/

/**
 * Loader ids the hide/unplug RPC must not disable. Desk, Cursor panel, and
 * overlay-card host sidecars stay mounted.
 */
const PROTECTED_LOADER_IDS: ReadonlySet<string> = new Set([
  'ui-float-window',
  'ui-cursor-agent',
  'cursor-agent',
  'overlay-card-roster-rpc',
  'overlay-card-plug-rpc',
  'overlay-card-hide-rpc',
  'overlay-card-rpc',
])

/** Body slot for seat 1, or `overlay-card-N.body` for N greater than 1. */
export type OverlayCardBodySlot<N extends OverlayCardNumber = OverlayCardNumber> = N extends 1
  ? 'overlay-card.body'
  : `overlay-card-${N}.body`

/** Trailing chrome slot for seat 1, or `overlay-card-N.chrome.trailing` otherwise. */
export type OverlayCardTrailingSlot<N extends OverlayCardNumber = OverlayCardNumber> = N extends 1
  ? 'overlay-card.chrome.trailing'
  : `overlay-card-${N}.chrome.trailing`

/** Union of every body and trailing slot the desk declares. */
export type OverlayCardChildSlot = OverlayCardBodySlot | OverlayCardTrailingSlot

/** One mounted card as stored in `instances.json` and returned by `instances.list`. */
export interface OverlayCardSpec {
  /** Slot seat 1..8 (`overlay-card.body` is seat 1). */
  readonly seat: OverlayCardNumber
  /** Unique card id shown in chrome and used by `overlay:live remove overlay-card-<id>`. */
  readonly id: string
  /** Title-bar left name. */
  readonly title: string
  /** Opening width in CSS pixels. */
  readonly width: number
  /** Opening height in CSS pixels. */
  readonly height: number
  /**
   * When `true`, the desk does not mount this window. Omitted or `false` means
   * visible when {@link OverlayCardSpec.inserted} is also true. Hide state
   * survives unplug so a later insert does not force the window on.
   */
  readonly hidden?: boolean
  /**
   * Loader ids whose fibers occupy this seat. Dual-face packages are one id.
   * Empty means hide still works and unplug is a no-op.
   */
  readonly occupants?: readonly string[]
  /**
   * Wire-only: `false` when any occupant row is `disabled: true` or missing
   * from the live profile patch. Omitted on disk; list always sets it.
   */
  readonly inserted?: boolean
}

/** Optional insert-time overrides; omitted fields take the documented defaults. */
export interface OverlayCardInsertRequest {
  /** Unique id; default is the seat as a decimal string (`1`, `2`, …). */
  readonly id?: string
  /** Title-bar name; default {@link OVERLAY_CARD_DEFAULT_TITLE}. */
  readonly title?: string
  /** Opening width; default {@link OVERLAY_CARD_DEFAULT_WIDTH}, clamped to that minimum. */
  readonly width?: number
  /** Opening height; default {@link OVERLAY_CARD_DEFAULT_HEIGHT}, clamped to that minimum. */
  readonly height?: number
}

/** Host and browser projection of which cards are mounted. */
export interface OverlayCardRoster {
  /** Card specs in insert order. */
  readonly cards: readonly OverlayCardSpec[]
}

/**
 * Whether `n` is a seat the desk may mount.
 * @param n - candidate.
 */
export function isOverlayCardNumber(n: number): n is OverlayCardNumber {
  return Number.isInteger(n) && n >= 1 && n <= OVERLAY_CARD_MAX
}

/**
 * Whether `id` is a unique card id token or occupant Loader id.
 * @param id - candidate.
 */
export function isOverlayCardId(id: string): boolean {
  return CARD_ID_PATTERN.test(id)
}

/**
 * Whether this Loader id is the desk, Cursor panel, or an overlay-card RPC helper.
 * @param id - Loader id.
 */
export function isProtectedOverlayCardLoaderId(id: string): boolean {
  return PROTECTED_LOADER_IDS.has(id)
}

/**
 * Parse `overlay-card-<id>` as used by `overlay:live remove`.
 * @param token - CLI id.
 * @returns the unique card id when the token is that form, otherwise `undefined`.
 */
export function parseOverlayCardInstanceId(token: string): string | undefined {
  const match = /^overlay-card-(.+)$/.exec(token)
  if (match === null) return undefined
  const id = match[1]
  if (id === undefined || !isOverlayCardId(id)) return undefined
  return id
}

/**
 * Body slot occupied by the page on seat `n`.
 * @param n - seat.
 * @throws when `n` is outside 1..{@link OVERLAY_CARD_MAX}.
 */
export function overlayCardBodySlot(n: number): OverlayCardBodySlot {
  if (!isOverlayCardNumber(n)) {
    throw new Error(`overlay-card: card number must be 1..${String(OVERLAY_CARD_MAX)}`)
  }
  return (n === 1 ? 'overlay-card.body' : `overlay-card-${String(n)}.body`) as OverlayCardBodySlot
}

/**
 * Seat for a body slot string from `dsh.client.overlayBody`.
 * @param slot - `overlay-card.body` or `overlay-card-N.body`.
 * @returns the seat, or `undefined` when the string is not a body slot.
 */
export function overlayCardSeatFromBodySlot(slot: string): OverlayCardNumber | undefined {
  if (slot === 'overlay-card.body') return 1
  const match = /^overlay-card-([2-8])\.body$/.exec(slot)
  if (match === null) return undefined
  const n = Number(match[1])
  return isOverlayCardNumber(n) ? n : undefined
}

/**
 * Trailing chrome slot on seat `n`.
 * @param n - seat.
 * @throws when `n` is outside 1..{@link OVERLAY_CARD_MAX}.
 */
export function overlayCardTrailingSlot(n: number): OverlayCardTrailingSlot {
  if (!isOverlayCardNumber(n)) {
    throw new Error(`overlay-card: card number must be 1..${String(OVERLAY_CARD_MAX)}`)
  }
  return (
    n === 1 ? 'overlay-card.chrome.trailing' : `overlay-card-${String(n)}.chrome.trailing`
  ) as OverlayCardTrailingSlot
}

/**
 * Default spec for seat 1 (first insert with no flags).
 */
export function defaultOverlayCardSpec(): OverlayCardSpec {
  return {
    seat: 1,
    id: '1',
    title: OVERLAY_CARD_DEFAULT_TITLE,
    width: OVERLAY_CARD_DEFAULT_WIDTH,
    height: OVERLAY_CARD_DEFAULT_HEIGHT,
  }
}

/**
 * Fields written to `instances.json` (no wire-only `inserted`).
 * @param spec - roster entry.
 */
export function persistOverlayCardSpec(spec: OverlayCardSpec): OverlayCardSpec {
  const occupants = spec.occupants
  return {
    seat: spec.seat,
    id: spec.id,
    title: spec.title,
    width: spec.width,
    height: spec.height,
    ...(spec.hidden === true ? { hidden: true } : {}),
    ...(occupants !== undefined && occupants.length > 0 ? { occupants: [...occupants] } : {}),
  }
}

/**
 * Whether the desk should skip this window for hide.
 * @param spec - roster entry.
 */
export function isOverlayCardHidden(spec: OverlayCardSpec): boolean {
  return spec.hidden === true
}

/**
 * Whether occupant fibers are inserted. Omitted `inserted` means inserted.
 * @param spec - roster entry, usually from `instances.list`.
 */
export function isOverlayCardInserted(spec: OverlayCardSpec): boolean {
  return spec.inserted !== false
}

/**
 * Whether every spec in a list payload set wire `inserted`.
 * A persist-only `/overlay-card` handler omits it; `/overlay-card-plug` sets it.
 * @param roster - decoded `instances.list` value.
 * @returns true when every card includes a boolean `inserted`.
 */
export function overlayCardRosterListsInserted(roster: OverlayCardRoster): boolean {
  return roster.cards.every(card => typeof card.inserted === 'boolean')
}

/**
 * Whether the desk should mount this spec: not hidden and inserted.
 * @param spec - roster entry.
 */
export function isOverlayCardMounted(spec: OverlayCardSpec): boolean {
  return !isOverlayCardHidden(spec) && isOverlayCardInserted(spec)
}

/**
 * Narrow an RPC value to {@link OverlayCardRoster}.
 * @param value - decoded JSON.
 */
export function isOverlayCardRoster(value: unknown): value is OverlayCardRoster {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  if (!('cards' in value) || !Array.isArray(value.cards)) return false
  const seats = new Set<number>()
  const ids = new Set<string>()
  for (const item of value.cards) {
    if (!isOverlayCardSpec(item)) return false
    if (seats.has(item.seat) || ids.has(item.id)) return false
    seats.add(item.seat)
    ids.add(item.id)
  }
  return true
}

/**
 * Read `{ "cards": OverlayCardSpec[] }` from `instances.json` text.
 * @param text - file contents.
 * @throws when JSON is not a roster.
 */
export function parseOverlayCardInstances(text: string): OverlayCardSpec[] {
  const value: unknown = JSON.parse(text) as unknown
  if (!isOverlayCardRoster(value)) {
    throw new Error('overlay-card: instances.json must be { "cards": spec[] } with unique seat and id')
  }
  return value.cards.map(card => persistOverlayCardSpec(migrateHidden(card)))
}

function migrateHidden(spec: OverlayCardSpec): OverlayCardSpec {
  const record = spec as OverlayCardSpec & { readonly plugged?: boolean }
  const hidden = record.hidden === true || (record.hidden === undefined && record.plugged === false)
  return { ...spec, hidden }
}

/**
 * Serialize a roster for `instances.json`.
 * @param cards - specs in insert order.
 */
export function formatOverlayCardInstances(cards: readonly OverlayCardSpec[]): string {
  return `${JSON.stringify({ cards: cards.map(card => persistOverlayCardSpec(card)) }, null, 2)}\n`
}

/**
 * Append one card using insert-time overrides (or defaults).
 * @param cards - loaded specs.
 * @param request - `--title` / `--card-id` / `--width` / `--height`.
 * @throws when the desk is full, the id is duplicate or invalid, or size is not a positive integer.
 */
export function appendOverlayCard(
  cards: readonly OverlayCardSpec[],
  request: OverlayCardInsertRequest = {},
): OverlayCardSpec[] {
  return [...cards, resolveOverlayCardInsert(cards, request)]
}

/**
 * Record a Loader id on the card that owns this body seat.
 * @param cards - loaded specs.
 * @param seat - body seat from {@link overlayCardSeatFromBodySlot}.
 * @param loaderId - profile Loader id (`overlay:live --id`).
 * @throws when the seat is missing, the id is invalid, or the id is protected.
 */
export function appendOverlayCardOccupant(
  cards: readonly OverlayCardSpec[],
  seat: OverlayCardNumber,
  loaderId: string,
): OverlayCardSpec[] {
  if (!isOverlayCardId(loaderId)) {
    throw new Error('overlay-card: occupant id must match [A-Za-z0-9][A-Za-z0-9_-]{0,31}')
  }
  if (isProtectedOverlayCardLoaderId(loaderId)) {
    throw new Error(`overlay-card: occupant ${JSON.stringify(loaderId)} is not a page fiber`)
  }
  if (!cards.some(card => card.seat === seat)) {
    throw new Error(`overlay-card: seat ${String(seat)} is not loaded`)
  }
  return cards.map((card) => {
    if (card.seat !== seat) return persistOverlayCardSpec(card)
    const occupants = card.occupants ?? []
    if (occupants.includes(loaderId)) return persistOverlayCardSpec(card)
    return persistOverlayCardSpec({ ...card, occupants: [...occupants, loaderId] })
  })
}

/**
 * Build the next card spec from the current roster and insert flags.
 * @param cards - loaded specs.
 * @param request - insert-time overrides.
 */
export function resolveOverlayCardInsert(
  cards: readonly OverlayCardSpec[],
  request: OverlayCardInsertRequest = {},
): OverlayCardSpec {
  if (cards.length >= OVERLAY_CARD_MAX) {
    throw new Error(`overlay-card: at most ${String(OVERLAY_CARD_MAX)} cards`)
  }
  let maxSeat = 0
  const ids = new Set<string>()
  for (const card of cards) {
    ids.add(card.id)
    if (card.seat > maxSeat) maxSeat = card.seat
  }
  const nextSeat = maxSeat + 1
  if (!isOverlayCardNumber(nextSeat)) {
    throw new Error(`overlay-card: at most ${String(OVERLAY_CARD_MAX)} cards`)
  }
  const id = request.id ?? String(nextSeat)
  if (!isOverlayCardId(id)) {
    throw new Error('overlay-card: --card-id must match [A-Za-z0-9][A-Za-z0-9_-]{0,31}')
  }
  if (ids.has(id)) {
    throw new Error(`overlay-card: card id ${JSON.stringify(id)} is already loaded`)
  }
  const title = (request.title ?? OVERLAY_CARD_DEFAULT_TITLE).trim()
  if (title.length === 0) {
    throw new Error('overlay-card: --title must be non-empty')
  }
  return {
    seat: nextSeat,
    id,
    title,
    width: clampOpeningSize(request.width, OVERLAY_CARD_DEFAULT_WIDTH, '--width'),
    height: clampOpeningSize(request.height, OVERLAY_CARD_DEFAULT_HEIGHT, '--height'),
  }
}

/**
 * Drop one card by unique id.
 * @param cards - loaded specs.
 * @param id - `--card-id` / unique id.
 * @throws when that id is not loaded.
 */
export function dropOverlayCard(cards: readonly OverlayCardSpec[], id: string): OverlayCardSpec[] {
  if (!cards.some(card => card.id === id)) {
    throw new Error(`overlay-card: card ${JSON.stringify(id)} is not loaded`)
  }
  return cards.filter(card => card.id !== id).map(card => persistOverlayCardSpec(card))
}

/**
 * Set {@link OverlayCardSpec.hidden} for one unique id. `false` omits the field.
 * @param cards - loaded specs.
 * @param id - `--card-id` / unique id.
 * @param hidden - `true` skips the window; `false` shows it when inserted.
 * @throws when that id is not in the roster.
 */
export function setOverlayCardHidden(
  cards: readonly OverlayCardSpec[],
  id: string,
  hidden: boolean,
): OverlayCardSpec[] {
  if (!cards.some(card => card.id === id)) {
    throw new Error(`overlay-card: card ${JSON.stringify(id)} is not loaded`)
  }
  return cards.map((card) => {
    if (card.id !== id) return persistOverlayCardSpec(card)
    return persistOverlayCardSpec({ ...card, hidden })
  })
}

function isOverlayCardSpec(value: unknown): value is OverlayCardSpec {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (typeof record.seat !== 'number' || !isOverlayCardNumber(record.seat)) return false
  if (typeof record.id !== 'string' || !isOverlayCardId(record.id)) return false
  if (typeof record.title !== 'string' || record.title.trim().length === 0) return false
  if (typeof record.width !== 'number' || !Number.isInteger(record.width) || record.width < OVERLAY_CARD_DEFAULT_WIDTH) {
    return false
  }
  if (typeof record.height !== 'number' || !Number.isInteger(record.height) || record.height < OVERLAY_CARD_DEFAULT_HEIGHT) {
    return false
  }
  if (record.hidden !== undefined && typeof record.hidden !== 'boolean') return false
  if (record.plugged !== undefined && typeof record.plugged !== 'boolean') return false
  if (record.inserted !== undefined && typeof record.inserted !== 'boolean') return false
  if (record.occupants !== undefined) {
    if (!Array.isArray(record.occupants)) return false
    const seen = new Set<string>()
    for (const item of record.occupants) {
      if (typeof item !== 'string' || !isOverlayCardId(item) || seen.has(item)) return false
      seen.add(item)
    }
  }
  return true
}

function clampOpeningSize(value: number | undefined, fallback: number, flag: string): number {
  const size = value ?? fallback
  if (!Number.isInteger(size) || size < fallback) {
    throw new Error(`overlay-card: ${flag} must be an integer >= ${String(fallback)}`)
  }
  return size
}
