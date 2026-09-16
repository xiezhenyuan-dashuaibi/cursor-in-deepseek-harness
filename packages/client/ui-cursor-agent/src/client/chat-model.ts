/** Client-side folds of Cursor CLI `stream-json` events into transcript turns. */

/** Token counts copied from a Cursor `result.usage` (or `usage`) object. */
export type TokenUsage = {
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
}

/** Labels for the fields {@link formatUsageLine} may emit, in display order. */
export type UsageLabels = {
  readonly input: string
  readonly output: string
  readonly cacheRead: string
  readonly cacheWrite: string
}

/** Tool family for Cursor-style summaries (`taskToolCall`, `shellToolCall`, …). */
export type ToolFamily = 'task' | 'shell' | 'generic'

/** One visible band in the overlay transcript. */
export type ChatTurn =
  | { readonly id: string; readonly role: 'user'; readonly text: string }
  | { readonly id: string; readonly role: 'assistant'; readonly text: string; readonly streaming?: boolean }
  | { readonly id: string; readonly role: 'thinking'; readonly text: string; readonly streaming?: boolean }
  | {
    readonly id: string
    readonly role: 'tool'
    readonly name: string
    readonly status: 'running' | 'done' | 'error'
    readonly family: ToolFamily
    /** Short human title (task description, shell command, …). */
    readonly title?: string
    /** Task completed with `is_background` — still counts toward the live task board. */
    readonly background?: boolean
    readonly detail?: string
  }
  | { readonly id: string; readonly role: 'system'; readonly text: string }
  | { readonly id: string; readonly role: 'activity'; readonly kind: 'init' | 'notice'; readonly label: string }

/** Transcript plus the latest usage snapshot the CLI has emitted. */
export type ChatFold = {
  readonly turns: readonly ChatTurn[]
  readonly usage?: TokenUsage
}

const USAGE_FIELDS = [
  ['inputTokens', 'input'],
  ['outputTokens', 'output'],
  ['cacheReadTokens', 'cacheRead'],
  ['cacheWriteTokens', 'cacheWrite'],
] as const

const KNOWN_EVENT_TYPES = new Set([
  'user',
  'assistant',
  'thinking',
  'tool_call',
  'result',
  'system',
  'usage',
])

/** Long enough that a doubled snapshot is a real reply, not a two-token stutter. */
const SNAPSHOT_UNIT_MIN = 32

/**
 * A sentence this long that appears again later is a restarted copy, even when
 * the first copy opened with a different short lead-in.
 */
const REPEAT_SEGMENT_MIN = 16

let nextTurnId = 1

/**
 * Mint a stable turn id for this browser page.
 * @returns a unique turn id.
 */
export function mintTurnId(): string {
  const id = `turn-${nextTurnId}`
  nextTurnId += 1
  return id
}

/**
 * Reset the turn counter (tests only).
 */
export function resetTurnIdsForTests(): void {
  nextTurnId = 1
}

/**
 * Empty fold used when a chat socket mounts.
 * @returns a fold with no turns and no usage.
 */
export function emptyChatFold(): ChatFold {
  return { turns: [] }
}

/**
 * Pull plain text from a Cursor stream-json message content array.
 * @param message - parsed `message` object from a user/assistant event.
 * @returns concatenated text parts.
 */
export function messageText(message: unknown): string {
  if (typeof message !== 'object' || message === null) return ''
  const content = (message as { content?: unknown }).content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const item of content) {
    if (typeof item !== 'object' || item === null) continue
    const text = (item as { text?: unknown }).text
    if (typeof text !== 'string') continue
    const previous = parts[parts.length - 1]
    if (previous !== undefined && text === previous && text.length >= SNAPSHOT_UNIT_MIN) continue
    parts.push(text)
  }
  return parts.join('')
}

/**
 * Whether an assistant stream-json event is a usable partial delta.
 * Official rule: keep events with `timestamp_ms` and without `model_call_id`.
 * @param event - one parsed NDJSON object.
 * @returns true when the text should append to the live assistant band.
 */
export function isAssistantDelta(event: Record<string, unknown>): boolean {
  if (event.type !== 'assistant') return false
  if (!('timestamp_ms' in event)) return false
  if ('model_call_id' in event) return false
  return true
}

/**
 * Strip whitespace so GFM table padding still compares as the same reply.
 * `--stream-partial-output` often re-emits one markdown snapshot with different
 * pipe spacing; those must not concatenate into a doubled band.
 */
function compactAssistantText(text: string): string {
  return text.replace(/\s+/gu, '')
}

/** True when `full` is `unit` written twice, raw or ignoring whitespace. */
function isRepeatedTwice(full: string, unit: string): boolean {
  if (unit.length < SNAPSHOT_UNIT_MIN) return false
  if (full === unit + unit) return true
  const compactFull = compactAssistantText(full)
  const compactUnit = compactAssistantText(unit)
  return compactUnit.length >= SNAPSHOT_UNIT_MIN && compactFull === compactUnit + compactUnit
}

/**
 * Join a later assistant payload onto the trailing assistant row.
 * A longer snapshot replaces, a replayed prefix or in-band chunk is ignored,
 * a jammed copy and a pretty copy of the same opening replace with the later
 * text, and a true delta appends. A later snapshot that shares two or more
 * sentences with the trailing row replaces it even when the lead sentence
 * differs. Callers only pass the last transcript row.
 * @param existing - text already on the trailing assistant row.
 * @param incoming - text from this stream-json event.
 * @returns the surviving text.
 */
export function coalesceAssistantText(existing: string, incoming: string): string {
  if (incoming.length === 0) return existing
  if (existing.length === 0) return incoming
  if (incoming === existing) return existing
  if (isRepeatedTwice(existing, incoming)) return incoming
  if (isRepeatedTwice(incoming, existing)) return existing
  if (incoming.startsWith(existing)) return incoming
  if (existing.startsWith(incoming)) return existing
  if (incoming.length >= 8 && existing.includes(incoming)) return existing
  if (existing.length >= 8 && incoming.includes(existing)) return incoming
  const compactExisting = compactAssistantText(existing)
  const compactIncoming = compactAssistantText(incoming)
  if (compactIncoming.length === 0) return existing
  if (compactExisting.length === 0) return incoming
  if (compactIncoming === compactExisting) return incoming
  if (compactIncoming.startsWith(compactExisting)) return incoming
  if (compactExisting.startsWith(compactIncoming)) return existing
  if (compactIncoming.length >= 8 && compactExisting.includes(compactIncoming)) return existing
  if (compactExisting.length >= 8 && compactIncoming.includes(compactExisting)) return incoming
  if (isRestartedSnapshot(existing, incoming)) return incoming
  if (incoming.length >= SNAPSHOT_UNIT_MIN && mostlyCoveredBy(existing, incoming)) return incoming
  return existing + incoming
}

/**
 * True when `incoming` is the same reply as `existing` restarted with different
 * markdown (jammed pipes vs padded GFM). Neither string is a prefix of the other,
 * so a concat would glue an unreadable draft in front of the pretty copy.
 */
function isRestartedSnapshot(existing: string, incoming: string): boolean {
  const compactExisting = compactAssistantText(existing)
  const compactIncoming = compactAssistantText(incoming)
  if (
    compactExisting.length < SNAPSHOT_UNIT_MIN
    || compactIncoming.length < SNAPSHOT_UNIT_MIN
  ) {
    return false
  }
  if (compactExisting.slice(0, SNAPSHOT_UNIT_MIN) !== compactIncoming.slice(0, SNAPSHOT_UNIT_MIN)) {
    return false
  }
  return !compactIncoming.startsWith(compactExisting) && !compactExisting.startsWith(compactIncoming)
}

/**
 * True when at least two substantial sentences of `draft` appear in `later`.
 * A unique short lead-in on a jammed copy does not block treating `later` as
 * the same reply.
 * @param draft - earlier assistant text.
 * @param later - later assistant text.
 * @returns true when `later` covers two or more substantial sentences of `draft`.
 */
function mostlyCoveredBy(draft: string, later: string): boolean {
  const compactLater = compactAssistantText(later)
  if (compactLater.length < SNAPSHOT_UNIT_MIN) return false
  const units = substantialReplayUnits(draft)
  /* v8 ignore next -- a repeating offset always leaves the first copy in the head. */
  if (units.length === 0) return false
  let hits = 0
  for (const unit of units) {
    if (compactLater.includes(unit)) hits += 1
  }
  return hits >= 2
}

/**
 * Compact sentences long enough to identify a restarted copy.
 * @param text - assistant text.
 * @returns compact sentence units of at least {@link REPEAT_SEGMENT_MIN} characters.
 */
function substantialReplayUnits(text: string): string[] {
  const units: string[] = []
  for (const segment of splitAssistantSegments(text)) {
    const compact = compactAssistantText(segment.trim())
    if (compact.length >= REPEAT_SEGMENT_MIN) units.push(compact)
  }
  return units
}

/**
 * Drop an earlier copy of the reply that restarts later in the same band.
 * A compact prefix from the start of the band is the cut when that prefix
 * appears again later. When the first copy opened with a different sentence,
 * the cut is the later copy of the first sentence of at least 16 characters
 * that appears again, if two or more sentences before that cut also appear
 * after it.
 * @param text - assistant text already joined onto one band.
 * @returns the text with the earlier copy removed.
 */
export function collapseReplayedAssistantText(text: string): string {
  if (text.length < SNAPSHOT_UNIT_MIN * 2) return text
  const replayAt = findReplayOffset(text)
  if (replayAt > 0 && replayAt < text.length) {
    const tail = text.slice(replayAt).replace(/^\n+/u, '')
    /* v8 ignore next -- a restart offset in range is never only newlines. */
    if (tail.length === 0) return dropContainedSegments(text)
    return collapseReplayedAssistantText(tail)
  }
  return dropContainedSegments(text)
}

/**
 * Map a compact-string offset back onto `text`, skipping whitespace.
 * @param text - original assistant text.
 * @param compactOffset - index into {@link compactAssistantText} of `text`.
 * @returns the matching original index, or `text.length` when the compact
 *   offset is past the last non-whitespace character.
 */
function originalIndexAtCompactOffset(text: string, compactOffset: number): number {
  let compact = 0
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index]
    /* v8 ignore next -- the loop stays inside the string. */
    if (ch === undefined) continue
    if (/\s/u.test(ch)) continue
    if (compact === compactOffset) return index
    compact += 1
  }
  /* v8 ignore next -- compact indexOf yields an offset inside the string. */
  return text.length
}

/**
 * Offset where a leading sentence/paragraph run starts again later in `text`.
 * Prefers the longest compact prefix from the start so a same-opening pretty
 * copy keeps its short lead-in. Falls back to a later copy of a sentence that
 * is not the opening of `text`.
 * @param text - one assistant band.
 * @returns the later start index, or -1.
 */
function findReplayOffset(text: string): number {
  const segments = splitAssistantSegments(text)
  const compactText = compactAssistantText(text)
  let acc = 0
  let bestLen = 0
  let bestAt = -1
  for (const segment of segments) {
    acc += segment.length
    if (acc < SNAPSHOT_UNIT_MIN || acc >= text.length) continue
    const prefix = text.slice(0, acc)
    const later = text.indexOf(prefix, acc)
    if (later >= 0 && acc >= bestLen) {
      bestLen = acc
      bestAt = later
    }
    const compactPrefix = compactAssistantText(prefix)
    if (compactPrefix.length < SNAPSHOT_UNIT_MIN) continue
    const laterCompact = compactText.indexOf(compactPrefix, compactPrefix.length)
    if (laterCompact < 0) continue
    const original = originalIndexAtCompactOffset(text, laterCompact)
    /* v8 ignore next -- compact indexOf yields an in-range original index. */
    if (original >= text.length) continue
    bestLen = acc
    bestAt = original
  }
  if (segments.length <= 1) {
    const mid = Math.floor(text.length / 2)
    const head = text.slice(0, mid)
    const tail = text.slice(mid)
    if (head.length >= SNAPSHOT_UNIT_MIN && tail.includes(head)) return mid
    const compactHead = compactAssistantText(head)
    if (
      compactHead.length >= SNAPSHOT_UNIT_MIN
      && compactAssistantText(tail).includes(compactHead)
    ) {
      return mid
    }
  }
  if (bestAt >= 0) return bestAt
  const repeating = findRepeatingSegmentOffset(text)
  if (repeating > 0) {
    const tail = text.slice(repeating)
    if (mostlyCoveredBy(text.slice(0, repeating), tail)) return repeating
  }
  return -1
}

/**
 * Second occurrence of the first sentence/paragraph that is long enough to
 * mark a restarted copy. The first copy may open with a different short lead.
 * @param text - one assistant band.
 * @returns the later start index, or -1.
 */
function findRepeatingSegmentOffset(text: string): number {
  const segments = splitAssistantSegments(text)
  let pos = 0
  for (const segment of segments) {
    pos += segment.length
    const unit = segment.trim()
    if (unit.length < REPEAT_SEGMENT_MIN) continue
    const later = text.indexOf(unit, pos)
    if (later >= 0) return later
    const compactUnit = compactAssistantText(unit)
    if (compactUnit.length < REPEAT_SEGMENT_MIN) continue
    const compactText = compactAssistantText(text)
    const first = compactText.indexOf(compactUnit)
    /* v8 ignore next -- a trimmed segment's compact form is always in the compact band. */
    if (first < 0) continue
    const second = compactText.indexOf(compactUnit, first + compactUnit.length)
    if (second < 0) continue
    return originalIndexAtCompactOffset(text, second)
  }
  return -1
}

/**
 * Drop a middle sentence/paragraph that still appears later after a restart cut.
 * @param text - assistant text.
 * @returns text with contained units removed.
 */
function dropContainedSegments(text: string): string {
  const segments = splitAssistantSegments(text)
  if (segments.length <= 1) return text
  const kept: string[] = []
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    /* v8 ignore next -- the loop stays inside the split array. */
    if (segment === undefined) continue
    const later = segments.slice(index + 1).join('')
    const trimmed = segment.trim()
    if (trimmed.length >= SNAPSHOT_UNIT_MIN && later.includes(trimmed)) continue
    const compactSeg = compactAssistantText(trimmed)
    if (
      compactSeg.length >= SNAPSHOT_UNIT_MIN
      && compactAssistantText(later).includes(compactSeg)
    ) {
      continue
    }
    kept.push(segment)
  }
  return kept.join('').replace(/^\n+/u, '')
}

/** Paragraph, line, and sentence ends that bound one replay unit. */
const ASSISTANT_SEGMENT_END = /。|！|？|\n+|[.!?](?=\s)\s*/gu

/**
 * Split assistant text into sentence/paragraph units, keeping each delimiter
 * on the preceding unit so a dropped copy does not leave a stray period.
 * @param text - one assistant band.
 * @returns non-empty segments in order.
 */
function splitAssistantSegments(text: string): string[] {
  const segments: string[] = []
  let last = 0
  for (const match of text.matchAll(ASSISTANT_SEGMENT_END)) {
    const start = match.index
    /* v8 ignore next -- matchAll yields a defined index. */
    if (start === undefined) continue
    const end = start + match[0].length
    /* v8 ignore next -- the regex always advances. */
    if (end <= last) continue
    segments.push(text.slice(last, end))
    last = end
  }
  if (last < text.length) segments.push(text.slice(last))
  return segments
}

/**
 * Best-effort tool display name from a `tool_call` event payload.
 * @param toolCall - the `tool_call` object on the event.
 * @returns a short label for the tool card.
 */
export function toolCallName(toolCall: unknown): string {
  if (typeof toolCall !== 'object' || toolCall === null) return 'tool'
  const record = toolCall as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (key.endsWith('ToolCall') || key === 'function') {
      if (key === 'function') {
        const fn = record.function
        if (typeof fn === 'object' && fn !== null) {
          const name = (fn as { name?: unknown }).name
          if (typeof name === 'string') {
            if (name.length > 0) return name
          }
        }
        return 'function'
      }
      return key.replace(/ToolCall$/, '')
    }
  }
  return 'tool'
}

/**
 * Classify a stream-json `tool_call` object into a display family.
 * @param toolCall - the `tool_call` object on the event.
 * @returns `task` / `shell` / `generic`.
 */
export function toolCallFamily(toolCall: unknown): ToolFamily {
  if (typeof toolCall !== 'object' || toolCall === null) return 'generic'
  const record = toolCall as Record<string, unknown>
  if ('taskToolCall' in record) return 'task'
  if ('shellToolCall' in record) return 'shell'
  return 'generic'
}

/**
 * Pull a short title for task/shell tool rows from args or result.
 * @param toolCall - the `tool_call` object on the event.
 * @param field - which nested object to read.
 * @returns description/command text when present.
 */
export function toolCallTitle(
  toolCall: unknown,
  field: 'args' | 'result' = 'args',
): string | undefined {
  const nested = pickToolObject(toolCall, field)
  if (nested === undefined) return undefined
  for (const key of ['description', 'command', 'prompt']) {
    const value = nested[key]
    if (typeof value === 'string' && value.trim().length > 0) return clipHint(value.trim())
  }
  return undefined
}

/**
 * Whether a completed task tool result reports a background subagent.
 * @param toolCall - the `tool_call` object on a completed event.
 * @returns true when `result.success.is_background` (or camelCase) is set.
 */
export function toolCallIsBackground(toolCall: unknown): boolean {
  const result = pickToolObject(toolCall, 'result')
  if (result === undefined) return false
  const success = result.success
  if (typeof success === 'object' && success !== null) {
    const record = success as Record<string, unknown>
    if (record.is_background === true || record.isBackground === true) return true
  }
  if (result.is_background === true || result.isBackground === true) return true
  return false
}

/**
 * Count task tools that still look live (running, or completed-as-background).
 * @param turns - current transcript.
 * @returns the number of active task rows.
 */
export function countActiveTasks(turns: readonly ChatTurn[]): number {
  let count = 0
  for (const turn of turns) {
    if (turn.role !== 'tool' || turn.family !== 'task') continue
    if (turn.status === 'running' || turn.background === true) count += 1
  }
  return count
}

/**
 * Copy finite token fields from a Cursor usage object. Does not sum or invent totals.
 * @param value - `event.usage` or a dedicated `usage` event body.
 * @returns the named fields that are finite numbers, or undefined when none are.
 */
export function parseTokenUsage(value: unknown): TokenUsage | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const usage: {
    inputTokens?: number
    outputTokens?: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
  } = {}
  let any = false
  for (const [field] of USAGE_FIELDS) {
    const raw = record[field]
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      usage[field] = raw
      any = true
    }
  }
  return any ? usage : undefined
}

/**
 * Read usage from a `result` or dedicated `usage` stream-json event.
 * @param event - one parsed NDJSON object.
 * @returns the snapshot when the event carries token fields.
 */
export function readTokenUsage(event: Record<string, unknown>): TokenUsage | undefined {
  if (event.type === 'usage') {
    return parseTokenUsage(event.usage) ?? parseTokenUsage(event)
  }
  if (event.type === 'result') return parseTokenUsage(event.usage)
  return undefined
}

/**
 * Join present usage fields with their locale labels. Omits fields the CLI did not send.
 * @param usage - latest snapshot.
 * @param labels - locale strings for each named field.
 * @returns a single footer line, or empty when no numeric field is present.
 */
export function formatUsageLine(usage: TokenUsage, labels: UsageLabels): string {
  const parts: string[] = []
  for (const [field, labelKey] of USAGE_FIELDS) {
    const value = usage[field]
    if (typeof value === 'number') parts.push(`${labels[labelKey]} ${String(value)}`)
  }
  return parts.join(' · ')
}

/**
 * Fold one host `{op:"event"}` payload into the transcript and usage snapshot.
 * @param state - current fold.
 * @param event - Cursor stream-json object.
 * @returns the next fold.
 */
export function foldCursorEvent(state: ChatFold, event: Record<string, unknown>): ChatFold {
  const type = event.type
  if (type === 'user') {
    const text = messageText(event.message).trim()
    if (text.length === 0) return state
    // Skip the stream echo of an optimistic (or already-folded) user turn even when
    // system/init activity arrived between the local append and this event.
    if (hasMatchingRecentUser(state.turns, text)) return state
    return withTurns(state, [...state.turns, { id: mintTurnId(), role: 'user', text }])
  }
  if (type === 'assistant') {
    return foldAssistant(state, event)
  }
  if (type === 'thinking') {
    return foldThinking(state, event)
  }
  if (type === 'tool_call') {
    return foldToolCall(state, event)
  }
  if (type === 'system') {
    if (event.subtype === 'init') {
      const model = typeof event.model === 'string' ? event.model : ''
      return withTurns(state, [...state.turns, {
        id: mintTurnId(),
        role: 'activity',
        kind: 'init',
        label: model,
      }])
    }
    const subtype = typeof event.subtype === 'string' && event.subtype.length > 0
      ? event.subtype
      : ''
    const label = subtype.length > 0 ? `system/${subtype}` : 'system'
    return withTurns(state, [...state.turns, { id: mintTurnId(), role: 'activity', kind: 'notice', label }])
  }
  if (type === 'result' || type === 'usage') {
    const usage = readTokenUsage(event)
    let turns = state.turns
    if (type === 'result' && event.is_error === true) {
      const result = typeof event.result === 'string' ? event.result : 'Turn failed'
      turns = [...turns, { id: mintTurnId(), role: 'system', text: result }]
    }
    if (type === 'result') turns = settleStreamingTurns(turns)
    return usage !== undefined ? { turns, usage } : withTurns(state, turns)
  }
  if (typeof type === 'string' && !KNOWN_EVENT_TYPES.has(type)) {
    const subtype = typeof event.subtype === 'string' && event.subtype.length > 0
      ? event.subtype
      : ''
    const label = subtype.length > 0 ? `${type}/${subtype}` : type
    return withTurns(state, [...state.turns, { id: mintTurnId(), role: 'activity', kind: 'notice', label }])
  }
  return state
}

/**
 * Mark trailing streaming bands settled, collapse replayed assistant segments,
 * and mark leftover running tools done.
 * @param state - current fold.
 * @returns the fold with streaming flags cleared and replayed copies dropped.
 */
export function settleStreaming(state: ChatFold): ChatFold {
  return withTurns(state, settleStreamingTurns(state.turns))
}

function foldAssistant(state: ChatFold, event: Record<string, unknown>): ChatFold {
  const text = messageText(event.message)
  if (text.length === 0) return state
  const delta = isAssistantDelta(event)
  const last = state.turns.at(-1)
  if (last?.role === 'assistant') {
    return joinTrailingAssistant(state, last, text, delta)
  }
  const next: ChatTurn[] = [...state.turns, {
    id: mintTurnId(),
    role: 'assistant',
    text: collapseReplayedAssistantText(text),
    ...(delta ? { streaming: true } : {}),
  }]
  const ordered = delta ? next : settleThinkingTurns(next)
  return withTurns(state, dropSupersededAssistantBands(ordered))
}

/**
 * Join onto the live last row only. Thinking/tools already below that row stay
 * above any later assistant band; writing into an earlier assistant slot would
 * paint those steps under the answer.
 * @param state - current fold.
 * @param last - the trailing assistant row.
 * @param text - incoming assistant text.
 * @param delta - whether this event is a live stream-json delta.
 * @returns the next fold.
 */
function joinTrailingAssistant(
  state: ChatFold,
  last: Extract<ChatTurn, { role: 'assistant' }>,
  text: string,
  delta: boolean,
): ChatFold {
  const index = state.turns.length - 1
  const joined = coalesceAssistantText(last.text, text)
  if (!delta && joined === last.text + text) {
    const collapsedJoin = collapseReplayedAssistantText(joined)
    if (collapsedJoin !== joined) {
      return finalizeCompleteAssistant(state, index, collapsedJoin)
    }
    const next = [...state.turns]
    if (last.streaming === true) {
      next[index] = { id: last.id, role: 'assistant', text: last.text }
    }
    next.push({
      id: mintTurnId(),
      role: 'assistant',
      text: collapseReplayedAssistantText(text),
    })
    return withTurns(state, dropSupersededAssistantBands(settleThinkingTurns(next)))
  }
  if (delta) {
    if (joined === last.text && last.streaming === true) return state
    const next = [...state.turns]
    next[index] = { id: last.id, role: 'assistant', text: joined, streaming: true }
    return withTurns(state, dropSupersededAssistantBands(next))
  }
  if (joined === last.text && last.streaming !== true) return state
  return finalizeCompleteAssistant(state, index, joined)
}

/**
 * Write a finished assistant payload, clear thinking "running", and drop an
 * earlier band whose text appears in a later assistant band of this user turn.
 */
function finalizeCompleteAssistant(
  state: ChatFold,
  index: number,
  text: string,
): ChatFold {
  const last = state.turns[index]
  /* v8 ignore next -- callers pass the last assistant index. */
  if (last === undefined || last.role !== 'assistant') return state
  const turns = [...state.turns]
  turns[index] = { id: last.id, role: 'assistant', text }
  return withTurns(state, dropSupersededAssistantBands(settleThinkingTurns(turns)))
}

function foldThinking(state: ChatFold, event: Record<string, unknown>): ChatFold {
  const text = typeof event.text === 'string' ? event.text : ''
  if (event.subtype === 'completed') {
    const last = state.turns.at(-1)
    if (last?.role === 'thinking' && last.streaming) {
      const next = [...state.turns]
      next[next.length - 1] = { id: last.id, role: 'thinking', text: last.text }
      return withTurns(state, next)
    }
    return state
  }
  if (text.length === 0) return state
  const last = state.turns.at(-1)
  if (last?.role === 'thinking' && last.streaming) {
    const next = [...state.turns]
    next[next.length - 1] = {
      id: last.id,
      role: 'thinking',
      text: last.text + text,
      streaming: true,
    }
    return withTurns(state, next)
  }
  return withTurns(state, [...state.turns, { id: mintTurnId(), role: 'thinking', text, streaming: true }])
}

function foldToolCall(state: ChatFold, event: Record<string, unknown>): ChatFold {
  const subtype = event.subtype
  const callId = typeof event.call_id === 'string' && event.call_id.length > 0
    ? event.call_id
    : mintTurnId()
  const id = `tool-${callId}`
  const name = toolCallName(event.tool_call)
  const family = toolCallFamily(event.tool_call)
  const prior = state.turns.find((turn): turn is Extract<ChatTurn, { role: 'tool' }> => (
    turn.role === 'tool' && turn.id === id
  ))
  if (subtype === 'completed') {
    const detail = capJson(pickToolField(event.tool_call, 'result') ?? event.tool_call)
    const status = event.is_error === true ? 'error' as const : 'done' as const
    const title = toolCallTitle(event.tool_call, 'args')
      ?? toolCallTitle(event.tool_call, 'result')
      ?? prior?.title
    const background = status === 'done' && family === 'task' && toolCallIsBackground(event.tool_call)
    const replacement: ChatTurn = {
      id,
      role: 'tool',
      name: prior?.name ?? name,
      status,
      family: prior?.family ?? family,
      ...(title !== undefined ? { title } : {}),
      ...(background ? { background: true } : {}),
      ...(detail !== undefined ? { detail } : {}),
    }
    if (prior !== undefined) {
      return withTurns(state, state.turns.map(turn => (
        turn.role === 'tool' && turn.id === id ? replacement : turn
      )))
    }
    return withTurns(state, [...state.turns, replacement])
  }
  const detail = capJson(pickToolField(event.tool_call, 'args'))
  const title = toolCallTitle(event.tool_call, 'args') ?? prior?.title
  const running: ChatTurn = {
    id,
    role: 'tool',
    name: prior?.name ?? name,
    status: 'running',
    family: prior?.family ?? family,
    ...(title !== undefined ? { title } : {}),
    ...(detail !== undefined ? { detail } : {}),
  }
  if (prior !== undefined) {
    return withTurns(state, state.turns.map(turn => (
      turn.role === 'tool' && turn.id === id && turn.status === 'running' ? running : turn
    )))
  }
  return withTurns(state, [...state.turns, running])
}

function withTurns(state: ChatFold, turns: readonly ChatTurn[]): ChatFold {
  return state.usage === undefined ? { turns } : { turns, usage: state.usage }
}

/**
 * Whether a matching user turn already sits in the open prompt.
 * Skips activity/system rows and other user rows so a queued optimistic prompt
 * between the echoed text and `system/init` does not defeat dedupe. After an
 * assistant/thinking/tool row, the same text is a new prompt unless a more
 * recent `system/init` (newer than that model row) marks a CLI `--resume`
 * replay of the open turn. An earlier turn's init does not count.
 * @param turns - current transcript.
 * @param text - trimmed user text from the stream event.
 * @returns true when a matching recent user turn is already present.
 */
export function hasMatchingRecentUser(turns: readonly ChatTurn[], text: string): boolean {
  let seenInit = false
  let seenModelTurn = false
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]
    /* v8 ignore next -- reverse scan stays inside the array bounds. */
    if (turn === undefined) return false
    if (turn.role === 'user') {
      if (turn.text === text) return seenInit || !seenModelTurn
      continue
    }
    if (turn.role === 'activity') {
      if (turn.kind === 'init' && !seenModelTurn) seenInit = true
      continue
    }
    if (turn.role === 'system') continue
    seenModelTurn = true
  }
  return false
}

/**
 * Short hint for a collapsed tool line from capped JSON args/result.
 * Prefers common path/pattern/query/command fields when present.
 * @param detail - capped JSON string from the fold, if any.
 * @returns a short display fragment, or empty when none is useful.
 */
export function toolHintFromDetail(detail: string | undefined): string {
  if (detail === undefined || detail.length === 0) return ''
  try {
    const parsed: unknown = JSON.parse(detail.endsWith('…') ? detail.slice(0, -1) : detail)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>
      for (const key of [
        'description',
        'command',
        'path',
        'file',
        'pattern',
        'query',
        'glob',
        'target',
        'prompt',
      ]) {
        const value = record[key]
        if (typeof value === 'string' && value.trim().length > 0) {
          return clipHint(value.trim())
        }
      }
    }
  } catch {
    // Non-JSON detail still makes a usable one-line hint.
  }
  return clipHint(detail)
}

function pickToolObject(
  toolCall: unknown,
  field: 'args' | 'result',
): Record<string, unknown> | undefined {
  const value = pickToolField(toolCall, field)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function clipHint(value: string): string {
  const oneLine = value.replace(/\s+/g, ' ').trim()
  if (oneLine.length <= 72) return oneLine
  return `${oneLine.slice(0, 72)}…`
}

function settleStreamingTurns(turns: readonly ChatTurn[]): ChatTurn[] {
  return dropSupersededAssistantBands(settleThinkingTurns(turns.map((turn) => {
    if (turn.role === 'assistant') {
      const text = collapseReplayedAssistantText(turn.text)
      if (turn.streaming === true || text !== turn.text) {
        return { id: turn.id, role: 'assistant' as const, text }
      }
      return turn
    }
    if (turn.role === 'tool' && turn.status === 'running') {
      return { ...turn, status: 'done' as const }
    }
    return turn
  })))
}

/**
 * Drop an earlier assistant band in this user turn when a later band is the
 * same reply (pretty snapshot, padded table, or identical replay).
 * Thinking and tool rows keep their event order.
 * @param turns - current transcript.
 * @returns turns with superseded assistant drafts removed.
 */
function dropSupersededAssistantBands(turns: readonly ChatTurn[]): ChatTurn[] {
  let lastUser = -1
  for (let index = 0; index < turns.length; index += 1) {
    if (turns[index]?.role === 'user') lastUser = index
  }
  const assistants: number[] = []
  for (let index = lastUser + 1; index < turns.length; index += 1) {
    if (turns[index]?.role === 'assistant') assistants.push(index)
  }
  if (assistants.length < 2) return [...turns]
  const drop = new Set<number>()
  for (let earlierPos = 0; earlierPos < assistants.length; earlierPos += 1) {
    const earlierIndex = assistants[earlierPos]
    /* v8 ignore next -- assistants collects in-range indexes. */
    if (earlierIndex === undefined) continue
    const earlier = turns[earlierIndex]
    /* v8 ignore next -- assistants is filtered to assistant rows. */
    if (earlier?.role !== 'assistant') continue
    for (let laterPos = earlierPos + 1; laterPos < assistants.length; laterPos += 1) {
      const laterIndex = assistants[laterPos]
      /* v8 ignore next -- assistants collects in-range indexes. */
      if (laterIndex === undefined) continue
      const later = turns[laterIndex]
      /* v8 ignore next -- assistants is filtered to assistant rows. */
      if (later?.role !== 'assistant') continue
      if (!isSupersededAssistantDraft(earlier.text, later.text)) continue
      drop.add(earlierIndex)
      break
    }
  }
  if (drop.size === 0) return [...turns]
  return turns.filter((_, index) => !drop.has(index))
}

/** True when `later` is the same reply as `draft` and should keep only `later`. */
function isSupersededAssistantDraft(draft: string, later: string): boolean {
  if (later === draft) return true
  if (draft.length > 0 && later.startsWith(draft)) return true
  if (draft.length >= SNAPSHOT_UNIT_MIN && later.includes(draft)) return true
  const compactDraft = compactAssistantText(draft)
  const compactLater = compactAssistantText(later)
  if (compactDraft.length > 0 && compactLater.startsWith(compactDraft)) return true
  if (compactDraft.length >= SNAPSHOT_UNIT_MIN && compactLater.includes(compactDraft)) return true
  if (isRestartedSnapshot(draft, later)) return true
  if (later.length >= SNAPSHOT_UNIT_MIN && mostlyCoveredBy(draft, later)) return true
  return collapseReplayedAssistantText(`${draft}\n\n${later}`)
    === collapseReplayedAssistantText(later)
}

function settleThinkingTurns(turns: readonly ChatTurn[]): ChatTurn[] {
  return turns.map((turn) => {
    if (turn.role === 'thinking' && turn.streaming) {
      return { id: turn.id, role: 'thinking', text: turn.text }
    }
    return turn
  })
}

function pickToolField(toolCall: unknown, field: 'args' | 'result'): unknown {
  if (typeof toolCall !== 'object' || toolCall === null) return undefined
  const record = toolCall as Record<string, unknown>
  for (const value of Object.values(record)) {
    if (typeof value === 'object' && value !== null && field in value) {
      return (value as Record<string, unknown>)[field]
    }
  }
  return undefined
}

function capJson(value: unknown): string | undefined {
  if (value === undefined) return undefined
  const json = JSON.stringify(value)
  if (json === undefined) return undefined
  if (json.length <= 160) return json
  return `${json.slice(0, 160)}…`
}
