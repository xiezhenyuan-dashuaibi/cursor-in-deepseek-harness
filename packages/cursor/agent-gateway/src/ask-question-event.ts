/** Project Cursor stream-json AskQuestion tool calls onto the overlay glass card. */

import type { MirrorBelowLine, PromptMirror } from './prompt-mirror.ts'

/** Literal tool-result text `--print` fabricates when no IDE form exists. */
export const ASK_QUESTION_SKIP_MARKER = 'Questions skipped by the user'

/** Cursor CLI synthetic freeform row id (interaction-utils `BU`). */
export const FREEFORM_OPTION_ID = '__freeform_other__'

/** One selectable row on an AskQuestion item. */
export type AskQuestionOption = {
  readonly id: string
  readonly label: string
}

/** One question inside an AskQuestion tool call. */
export type AskQuestionItem = {
  readonly id: string
  readonly prompt: string
  readonly allowMultiple: boolean
  readonly options: readonly AskQuestionOption[]
}

/** Parsed AskQuestion args for the overlay form. */
export type AskQuestionForm = {
  readonly title: string
  readonly questions: readonly AskQuestionItem[]
}

/** Live cursor / checkbox state for {@link applyAskQuestionKey}. */
export type AskQuestionUi = {
  readonly questionIndex: number
  readonly optionIndex: number
  /** Selected option ids keyed by question id. */
  readonly selected: Readonly<Record<string, readonly string[]>>
  /** Freeform Other text keyed by question id. */
  readonly freeform?: Readonly<Record<string, string>>
}

/** Result of applying one `{op:"keys"}` payload to an AskQuestion form. */
export type AskQuestionKeyResult =
  | { readonly kind: 'update'; readonly ui: AskQuestionUi }
  | { readonly kind: 'submit'; readonly text: string }
  | { readonly kind: 'dismiss' }
  | { readonly kind: 'ignore' }

/**
 * Read an AskQuestion form from a stream-json `tool_call` event.
 * @param event - one parsed NDJSON object.
 * @returns the form, or `undefined` when the event is not AskQuestion.
 */
export function readAskQuestionForm(
  event: Record<string, unknown>,
): AskQuestionForm | undefined {
  if (event.type !== 'tool_call') return undefined
  const toolCall = event.tool_call
  const args = pickToolArgs(toolCall)
  const name = readToolCallName(toolCall)
  if (!isAskQuestionName(name) && !looksLikeAskArgs(args)) return undefined
  return parseAskQuestionArgs(args)
}

/**
 * True when a `tool_call` result is the headless synthetic skip string.
 * @param event - one parsed NDJSON object.
 */
export function isAskQuestionSkipResult(event: Record<string, unknown>): boolean {
  if (event.type !== 'tool_call') return false
  if (event.subtype === 'started' || event.subtype === 'in_progress') return false
  return JSON.stringify(event).includes(ASK_QUESTION_SKIP_MARKER)
}

/**
 * Paint the current question onto `{op:"mirror"}.below`.
 * @param form - parsed AskQuestion args.
 * @param ui - live cursor and selections.
 */
export function projectAskQuestionMirror(
  form: AskQuestionForm,
  ui: AskQuestionUi,
): PromptMirror {
  const question = form.questions[clampIndex(ui.questionIndex, form.questions.length)]
  if (question === undefined) return { input: '', below: [] }
  const picked = new Set(ui.selected[question.id] ?? [])
  const optionAt = clampIndex(ui.optionIndex, question.options.length)
  const below: MirrorBelowLine[] = [
    { text: form.title.length > 0 ? `AskQuestion ${form.title}` : 'AskQuestion', highlighted: false },
    {
      text: `Question ${String(ui.questionIndex + 1)} of ${String(form.questions.length)}`,
      highlighted: false,
    },
    {
      text: `${String(ui.questionIndex + 1)}. ${question.prompt}${
        question.allowMultiple ? ' (multi-select)' : ''
      }`,
      highlighted: false,
    },
  ]
  const typed = questionFreeform(ui, question.id)
  for (let i = 0; i < question.options.length; i += 1) {
    const option = question.options[i]
    /* v8 ignore next -- i is in-range of a dense options array */
    if (option === undefined) continue
    const mark = picked.has(option.id) ? 'x' : ' '
    const prefix = i === optionAt ? '>' : ' '
    const label = option.id === FREEFORM_OPTION_ID
      ? (typed.length > 0 ? `Other: ${typed}` : 'Other')
      : option.label
    below.push({
      text: `${prefix} [${mark}] ${label}`,
      highlighted: i === optionAt,
    })
  }
  const onOther = question.options[optionAt]?.id === FREEFORM_OPTION_ID
  below.push({
    text: onOther
      ? 'Type to answer · Enter confirm · Esc to skip'
      : 'Space toggle · Enter confirm highlighted · Esc to skip',
    highlighted: false,
  })
  return { input: '', below }
}

/**
 * Apply one PTY-encoded key to the AskQuestion form.
 * @param form - parsed AskQuestion args.
 * @param ui - current cursor / selections.
 * @param data - `{op:"keys"}.data` (CSI arrows, space, CR, ESC, or Other text).
 */
export function applyAskQuestionKey(
  form: AskQuestionForm,
  ui: AskQuestionUi,
  data: string,
): AskQuestionKeyResult {
  const question = form.questions[clampIndex(ui.questionIndex, form.questions.length)]
  if (question === undefined) return { kind: 'dismiss' }
  if (data === '\x1b[A') {
    return {
      kind: 'update',
      ui: { ...ui, optionIndex: wrapIndex(ui.optionIndex - 1, question.options.length) },
    }
  }
  if (data === '\x1b[B') {
    return {
      kind: 'update',
      ui: { ...ui, optionIndex: wrapIndex(ui.optionIndex + 1, question.options.length) },
    }
  }
  const option = question.options[clampIndex(ui.optionIndex, question.options.length)]
  if (option !== undefined && option.id === FREEFORM_OPTION_ID) {
    if (data === '\x7f') {
      const current = questionFreeform(ui, question.id)
      if (current.length === 0) return { kind: 'ignore' }
      return { kind: 'update', ui: withFreeform(ui, question, current.slice(0, -1)) }
    }
    if (data === '\x15') {
      return { kind: 'update', ui: withFreeform(ui, question, '') }
    }
    if (data !== '\r' && data !== '\x1b' && data.length > 0 && !data.startsWith('\x1b')) {
      return { kind: 'update', ui: withFreeform(ui, question, questionFreeform(ui, question.id) + data) }
    }
  }
  if (data === ' ') {
    if (option === undefined) return { kind: 'ignore' }
    return { kind: 'update', ui: toggleOption(ui, question, option.id) }
  }
  if (data === '\r') {
    const committed = commitHighlighted(ui, question)
    if (committed.questionIndex + 1 < form.questions.length) {
      return {
        kind: 'update',
        ui: { ...committed, questionIndex: committed.questionIndex + 1, optionIndex: 0 },
      }
    }
    return { kind: 'submit', text: formatAskQuestionAnswers(form, committed) }
  }
  if (data === '\x1b') return { kind: 'dismiss' }
  return { kind: 'ignore' }
}

/**
 * Fresh UI at the first option of the first question.
 * @param form - parsed AskQuestion args.
 */
export function createAskQuestionUi(form: AskQuestionForm): AskQuestionUi {
  return {
    questionIndex: 0,
    optionIndex: 0,
    selected: Object.fromEntries(form.questions.map(item => [item.id, []])),
    freeform: Object.fromEntries(form.questions.map(item => [item.id, ''])),
  }
}

/**
 * Model-facing answer text for a completed overlay AskQuestion form.
 * @param form - parsed AskQuestion args.
 * @param ui - final selections.
 */
export function formatAskQuestionAnswers(form: AskQuestionForm, ui: AskQuestionUi): string {
  const lines = [`AskQuestion answers${form.title.length > 0 ? `: ${form.title}` : ''}`]
  for (const question of form.questions) {
    const ids = ui.selected[question.id] ?? []
    const labels = ids.map((id) => {
      if (id === FREEFORM_OPTION_ID) {
        const typed = questionFreeform(ui, question.id).trim()
        return typed.length > 0 ? typed : 'Other'
      }
      return question.options.find(option => option.id === id)?.label ?? id
    })
    const value = labels.length > 0 ? labels.join(', ') : '(none)'
    lines.push(`- ${question.prompt} → ${value}`)
  }
  return lines.join('\n')
}

function isAskQuestionName(name: string): boolean {
  const compact = name.replace(/[_-]/gu, '').toLowerCase()
  return compact === 'askquestion' || compact === 'askuserquestion'
}

function looksLikeAskArgs(args: unknown): boolean {
  if (typeof args !== 'object' || args === null) return false
  const questions = (args as { questions?: unknown }).questions
  return Array.isArray(questions) && questions.some(item => looksLikeAskQuestion(item))
}

function looksLikeAskQuestion(item: unknown): boolean {
  if (typeof item !== 'object' || item === null) return false
  const record = item as Record<string, unknown>
  if (!Array.isArray(record.options) || record.options.length === 0) return false
  return typeof record.prompt === 'string' || typeof record.question === 'string'
}

function parseAskQuestionArgs(args: unknown): AskQuestionForm | undefined {
  if (typeof args !== 'object' || args === null) return undefined
  const record = args as Record<string, unknown>
  const rawQuestions = record.questions
  if (!Array.isArray(rawQuestions)) return undefined
  const questions: AskQuestionItem[] = []
  for (const [index, item] of rawQuestions.entries()) {
    const parsed = parseQuestion(item, index)
    if (parsed !== undefined) questions.push(parsed)
  }
  if (questions.length === 0) return undefined
  const title = typeof record.title === 'string' ? record.title.trim() : ''
  return { title, questions }
}

function parseQuestion(item: unknown, index: number): AskQuestionItem | undefined {
  if (typeof item !== 'object' || item === null) return undefined
  const record = item as Record<string, unknown>
  const promptRaw = record.prompt ?? record.question
  if (typeof promptRaw !== 'string' || promptRaw.trim().length === 0) return undefined
  if (!Array.isArray(record.options)) return undefined
  const options: AskQuestionOption[] = []
  for (const [optionIndex, option] of record.options.entries()) {
    const parsed = parseOption(option, optionIndex)
    if (parsed !== undefined) options.push(parsed)
  }
  if (options.length === 0) return undefined
  const listed = stripTrailingCatchAll(options)
  listed.push({ id: FREEFORM_OPTION_ID, label: 'Other' })
  const id = typeof record.id === 'string' && record.id.length > 0
    ? record.id
    : `q${String(index + 1)}`
  return {
    id,
    prompt: promptRaw.trim(),
    allowMultiple: record.allow_multiple === true || record.allowMultiple === true,
    options: listed,
  }
}

function parseOption(option: unknown, index: number): AskQuestionOption | undefined {
  if (typeof option === 'string' && option.trim().length > 0) {
    return { id: `o${String(index + 1)}`, label: option.trim() }
  }
  if (typeof option !== 'object' || option === null) return undefined
  const record = option as Record<string, unknown>
  const labelRaw = record.label ?? record.text ?? record.name
  if (typeof labelRaw !== 'string' || labelRaw.trim().length === 0) return undefined
  const id = typeof record.id === 'string' && record.id.length > 0
    ? record.id
    : `o${String(index + 1)}`
  return { id, label: labelRaw.trim() }
}

function pickToolArgs(toolCall: unknown): unknown {
  if (typeof toolCall !== 'object' || toolCall === null) return undefined
  const record = toolCall as Record<string, unknown>
  const fn = record.function
  if (typeof fn === 'object' && fn !== null) {
    const args = (fn as { arguments?: unknown }).arguments
    if (typeof args === 'string') {
      try {
        return JSON.parse(args) as unknown
      } catch {
        return undefined
      }
    }
    if (args !== undefined) return args
  }
  for (const value of Object.values(record)) {
    if (typeof value !== 'object' || value === null) continue
    if ('args' in value) return (value as { args?: unknown }).args
  }
  return undefined
}

function readToolCallName(toolCall: unknown): string {
  if (typeof toolCall !== 'object' || toolCall === null) return ''
  const record = toolCall as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (key === 'function') {
      const fn = record.function
      if (typeof fn === 'object' && fn !== null) {
        const name = (fn as { name?: unknown }).name
        if (typeof name === 'string') return name
      }
      return 'function'
    }
    if (key.endsWith('ToolCall')) return key.replace(/ToolCall$/u, '')
  }
  return ''
}

/** Enter confirms the highlight; multi-select keeps existing Space checks. */
function commitHighlighted(
  ui: AskQuestionUi,
  question: AskQuestionItem,
): AskQuestionUi {
  const option = question.options[clampIndex(ui.optionIndex, question.options.length)]
  if (option === undefined) return ui
  const current = ui.selected[question.id] ?? []
  if (question.allowMultiple && current.length > 0) return ui
  return { ...ui, selected: { ...ui.selected, [question.id]: [option.id] } }
}

function toggleOption(
  ui: AskQuestionUi,
  question: AskQuestionItem,
  optionId: string,
): AskQuestionUi {
  const current = [...(ui.selected[question.id] ?? [])]
  const nextSelected = { ...ui.selected }
  if (question.allowMultiple) {
    const at = current.indexOf(optionId)
    if (at >= 0) current.splice(at, 1)
    else current.push(optionId)
    nextSelected[question.id] = current
  } else {
    nextSelected[question.id] = current.includes(optionId) ? [] : [optionId]
  }
  return { ...ui, selected: nextSelected }
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0
  if (index < 0) return 0
  if (index >= length) return length - 1
  return index
}

function wrapIndex(index: number, length: number): number {
  if (length <= 0) return 0
  return ((index % length) + length) % length
}

function questionFreeform(ui: AskQuestionUi, questionId: string): string {
  return ui.freeform?.[questionId] ?? ''
}

function withFreeform(
  ui: AskQuestionUi,
  question: AskQuestionItem,
  text: string,
): AskQuestionUi {
  const current = [...(ui.selected[question.id] ?? [])]
  const selected = { ...ui.selected }
  if (question.allowMultiple) {
    if (!current.includes(FREEFORM_OPTION_ID)) current.push(FREEFORM_OPTION_ID)
    selected[question.id] = current
  } else {
    selected[question.id] = [FREEFORM_OPTION_ID]
  }
  return {
    ...ui,
    selected,
    freeform: { ...ui.freeform, [question.id]: text },
  }
}

/** Cursor CLI trailing catch-all; replaced by the synthetic Other row. */
function stripTrailingCatchAll(options: AskQuestionOption[]): AskQuestionOption[] {
  const last = options[options.length - 1]
  /* v8 ignore next -- parseQuestion only strips a non-empty option list */
  if (last === undefined) return options
  if (isCatchAllOption(last)) return options.slice(0, -1)
  return options
}

function isCatchAllOption(option: AskQuestionOption): boolean {
  const id = option.id.toLowerCase()
  if (id === FREEFORM_OPTION_ID || id === 'other') return true
  return isCatchAllOptionLabel(option.label)
}

function isCatchAllOptionLabel(label: string): boolean {
  const n = label.trim().toLowerCase()
  if (n === 'other' || n === 'something else') return true
  if (n.startsWith('other:') || n.startsWith('other -') || n.startsWith('other (')) return true
  if (
    n.startsWith('something else:')
    || n.startsWith('something else -')
    || n.startsWith('something else (')
  ) {
    return true
  }
  return isLocalizedCatchAllLabel(label.trim())
}

function isLocalizedCatchAllLabel(label: string): boolean {
  return label.toLowerCase().startsWith('other\uFF08') || label.startsWith('\u5176\u4ED6')
}
