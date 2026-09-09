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
    if (typeof text === 'string') parts.push(text)
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
    const text = messageText(event.message)
    if (text.length === 0) return state
    if (isAssistantDelta(event)) {
      const last = state.turns.at(-1)
      if (last?.role === 'assistant' && last.streaming) {
        const next = [...state.turns]
        next[next.length - 1] = {
          id: last.id,
          role: 'assistant',
          text: last.text + text,
          streaming: true,
        }
        return withTurns(state, next)
      }
      return withTurns(state, [...state.turns, { id: mintTurnId(), role: 'assistant', text, streaming: true }])
    }
    const last = state.turns.at(-1)
    if (last?.role === 'assistant' && last.streaming) {
      const next = [...state.turns]
      next[next.length - 1] = { id: last.id, role: 'assistant', text }
      return withTurns(state, next)
    }
    return withTurns(state, [...state.turns, { id: mintTurnId(), role: 'assistant', text }])
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
 * Mark any trailing streaming assistant or thinking band as settled.
 * @param state - current fold.
 * @returns the fold with streaming flags cleared.
 */
export function settleStreaming(state: ChatFold): ChatFold {
  return withTurns(state, settleStreamingTurns(state.turns))
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
 * Whether a matching user turn already sits in the trailing pre-model block.
 * Skips activity/system rows and other user rows so a queued optimistic prompt
 * between the echoed text and `system/init` does not defeat dedupe.
 * @param turns - current transcript.
 * @param text - trimmed user text from the stream event.
 * @returns true when a matching recent user turn is already present.
 */
export function hasMatchingRecentUser(turns: readonly ChatTurn[], text: string): boolean {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]
    /* v8 ignore next -- reverse scan stays inside the array bounds. */
    if (turn === undefined) return false
    if (turn.role === 'user') {
      if (turn.text === text) return true
      continue
    }
    if (turn.role === 'activity' || turn.role === 'system') continue
    return false
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
  return turns.map((turn) => {
    if (turn.role === 'assistant' && turn.streaming) {
      return { id: turn.id, role: 'assistant', text: turn.text }
    }
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
