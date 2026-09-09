/** Real-time mirror of the CLI input bar and the region strictly below it. */

import type { ScreenSnapshot } from './screen-buffer.ts'

/** One display row under the CLI input bar (slash menu, trust, model list, …). */
export type MirrorBelowLine = {
  /** Raw row text (trailing spaces trimmed; leading indent kept). */
  readonly text: string
  /** True when the CLI marks this row with reverse video or a colored wash. */
  readonly highlighted: boolean
}

/** Snapshot published to the overlay as `{op:"mirror"}`. */
export type PromptMirror = {
  /** Text currently on the CLI input bar (prompt glyph stripped). */
  readonly input: string
  /** Rows strictly below the input bar, top to bottom — no invented chrome. */
  readonly below: readonly MirrorBelowLine[]
}

const PROMPT_MARK = String.raw`[❯›>→▸]`
const PROMPT_GLYPH = new RegExp(String.raw`^\s*${PROMPT_MARK}\s*`, 'u')
/** Incomplete slash draft on the input bar (`/`, `/m`, `/model`). */
const SLASH_DRAFT = /^\/[a-z0-9_-]*\s*$/iu
const ASK_HEADER = /\bAskQuestion\b/u
const ASK_PROGRESS = /^\s*Question\s+\d+\s+of\s+\d+/iu
const ASK_CHECKBOX = /^\s*>?\s*\[[ xX]\]\s+\S/u

type PromptKind = 'slash' | 'empty' | 'bare' | 'tip' | 'none'

/**
 * Extract the CLI input-bar text and every row strictly below it.
 *
 * Paint is authoritative: the gray bar locates the composer; reverse video or
 * a colored wash locates the highlighted option. Text matching only finds the
 * bar when paint is missing, and never treats a home-tip slogan or a picker
 * label as the bar while picker chrome is on screen. A picker with no input
 * bar (full-screen Ink pager) still publishes its body; the CLI header above
 * the first content row is omitted. A live AskQuestion Ink box is extracted
 * first and wins over a concurrent slash menu.
 * @param snapshot - {@link ScreenBuffer.snapshot} output.
 * @returns mirror fields for the overlay.
 */
export function extractPromptMirror(snapshot: ScreenSnapshot): PromptMirror {
  const ask = extractAskQuestionMirror(snapshot)
  if (ask !== undefined) return ask
  const promptRow = findPromptRow(
    snapshot.lines,
    snapshot.cursorRow,
    snapshot.reverseRows,
    snapshot.barBgRows ?? snapshot.lightBgRows,
    snapshot.accentRows,
  )
  if (promptRow !== undefined) {
    const draft = promptDraftText(snapshot.lines[promptRow] ?? '')
    return {
      // Approval / composing chrome must never paint into the overlay composer.
      input: isCliStatusChrome(draft) ? '' : draft,
      below: keepOptionSurface(
        collectRows(snapshot, lastBarRow(snapshot, promptRow) + 1),
      ),
    }
  }
  if (snapshot.lines.some(line => isCliPickerChrome(line))) {
    return { input: '', below: collectRows(snapshot, fullscreenPickerStart(snapshot.lines)) }
  }
  return { input: '', below: [] }
}

/**
 * True when a row is AskQuestion panel chrome (header, progress, checkbox, or
 * keyboard footer). `{op:"keys"}` Enter still reaches the PTY while that box
 * is up.
 * @param line - one screen row (box sides optional).
 * @returns whether the row is AskQuestion chrome.
 */
export function isAskQuestionChrome(line: string): boolean {
  const text = stripBoxSides(line).trimEnd()
  if (ASK_HEADER.test(text)) return true
  if (ASK_PROGRESS.test(text)) return true
  if (isAskQuestionFooter(text)) return true
  return ASK_CHECKBOX.test(text)
}

/**
 * Extract the inner rows of a Cursor AskQuestion Ink box, if one is on screen.
 *
 * Locates `AskQuestion` plus progress, checkbox, or footer chrome. A box-drawing
 * frame is stripped; conversation text above the box is omitted. Returns
 * `undefined` for a bare mention with no panel. {@link extractPromptMirror}
 * calls this first so a live question wins over `/`.
 * @param snapshot - {@link ScreenBuffer.snapshot} output.
 * @returns `{ input: '', below }` for the glass card, or `undefined`.
 */
export function extractAskQuestionMirror(snapshot: ScreenSnapshot): PromptMirror | undefined {
  const range = findAskQuestionRange(snapshot.lines)
  if (range === undefined) return undefined
  const below = collectAskRows(snapshot, range.start, range.end)
  if (!isAskQuestionPanel(below)) return undefined
  return { input: '', below }
}

function findAskQuestionRange(
  lines: readonly string[],
): { start: number; end: number } | undefined {
  let found: { start: number; end: number } | undefined
  for (let i = 0; i < lines.length; i += 1) {
    if (!ASK_HEADER.test(lines[i] ?? '')) continue
    found = expandAskRange(lines, i)
  }
  return found
}

function expandAskRange(
  lines: readonly string[],
  header: number,
): { start: number; end: number } {
  let start = header
  while (start > 0 && isBoxChromeRow(lines[start - 1] ?? '')) start -= 1

  let end = header
  let seenFooter = false
  let seenBody = false
  const limit = Math.min(lines.length - 1, header + 48)
  for (let i = header + 1; i <= limit; i += 1) {
    const line = lines[i] ?? ''
    if (seenFooter) {
      if (isBoxChromeRow(line)) {
        end = i
        continue
      }
      break
    }
    if (isBoxChromeRow(line)) {
      end = i
      const boxed = stripBoxSides(line)
      if (!isBoxFrameOnly(line)) seenBody = true
      if (isAskQuestionFooter(boxed)) seenFooter = true
      continue
    }
    const inner = stripBoxSides(line)
    if (
      ASK_PROGRESS.test(inner)
      || isAskQuestionFooter(inner)
      || ASK_CHECKBOX.test(inner)
      || (seenBody && isNumberedAskPrompt(inner))
      || inner.trim().length === 0
    ) {
      end = i
      if (
        ASK_PROGRESS.test(inner)
        || isAskQuestionFooter(inner)
        || ASK_CHECKBOX.test(inner)
      ) {
        seenBody = true
      }
      if (isAskQuestionFooter(inner)) seenFooter = true
      continue
    }
    break
  }
  while (end + 1 < lines.length && isBoxChromeRow(lines[end + 1] ?? '')) end += 1
  return { start, end }
}

function collectAskRows(
  snapshot: ScreenSnapshot,
  start: number,
  end: number,
): MirrorBelowLine[] {
  const below: MirrorBelowLine[] = []
  for (let i = start; i <= end; i += 1) {
    const raw = snapshot.lines[i] ?? ''
    if (isBoxFrameOnly(raw)) continue
    const text = stripBoxSides(raw).replace(/\s+$/u, '')
    below.push({
      text,
      highlighted: askRowHighlighted(snapshot, i, text),
    })
  }
  while (below.length > 0) {
    const last = below[below.length - 1]
    if (last === undefined || last.text.trim().length > 0) break
    below.pop()
  }
  return below
}

function isAskQuestionPanel(below: readonly MirrorBelowLine[]): boolean {
  return below.some(row => (
    ASK_PROGRESS.test(row.text)
    || isAskQuestionFooter(row.text)
    || ASK_CHECKBOX.test(row.text)
  ))
}

function askRowHighlighted(
  snapshot: ScreenSnapshot,
  index: number,
  text: string,
): boolean {
  if (snapshot.reverseRows[index] === true) return true
  if (snapshot.accentRows[index] === true) return true
  if (/^\s*>/u.test(text)) return true
  return snapshot.cursorRow === index && ASK_CHECKBOX.test(text)
}

function isAskQuestionFooter(text: string): boolean {
  if (/Space select/iu.test(text)) return true
  if (/Esc to skip/iu.test(text)) return true
  if (/Enter next\/submit/iu.test(text)) return true
  return text.includes('option') && text.includes('\u2191')
}

function isNumberedAskPrompt(text: string): boolean {
  return /^\s*\d+\.\s+\S/u.test(text)
}

function isBoxChromeRow(line: string): boolean {
  return isBoxFrameOnly(line) || isBoxSideRow(line)
}

function isBoxSideRow(line: string): boolean {
  const trimmed = line.trimStart()
  if (trimmed.length === 0) return false
  const mark = trimmed[0]
  return mark !== undefined && isBoxDrawingChar(mark)
}

function isBoxFrameOnly(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed.length === 0) return false
  let marks = 0
  for (const ch of trimmed) {
    if (ch === ' ') continue
    if (!isBoxDrawingChar(ch)) return false
    marks += 1
  }
  return marks > 0
}

function isBoxDrawingChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  return code >= 0x2500 && code <= 0x257F
}

function stripBoxSides(line: string): string {
  let start = 0
  let end = line.length
  if (isBoxDrawingChar(line[0] ?? '')) {
    start = 1
    if (line[1] === ' ') start = 2
  } else if (line[0] === ' ') {
    let i = 0
    while (i < line.length && line[i] === ' ') i += 1
    const inner = line[i]
    if (i < line.length && inner !== undefined && isBoxDrawingChar(inner)) {
      start = i + 1
      if (line[start] === ' ') start += 1
    }
  }
  while (end > start && line[end - 1] === ' ') end -= 1
  const edge = line[end - 1]
  if (end > start && edge !== undefined && isBoxDrawingChar(edge)) {
    end -= 1
    if (end > start && line[end - 1] === ' ') end -= 1
  }
  return line.slice(start, end)
}

/**
 * Copy painted rows from `start` to the last non-blank row.
 * Trailing blank PTY rows are dropped; internal blanks are kept.
 * @param snapshot - screen snapshot.
 * @param start - first row index to include.
 * @returns mirrored lines.
 */
function collectRows(snapshot: ScreenSnapshot, start: number): MirrorBelowLine[] {
  const below: MirrorBelowLine[] = []
  for (let i = start; i < snapshot.lines.length; i += 1) {
    const line = snapshot.lines[i] ?? ''
    const text = line.replace(/\s+$/u, '')
    below.push({
      text,
      highlighted: rowHighlighted(snapshot, i),
    })
  }
  while (below.length > 0) {
    const last = below[below.length - 1]
    if (last === undefined || last.text.trim().length > 0) break
    below.pop()
  }
  return below
}

/**
 * Drop idle status lines under the bar (model name, cwd, abort banners, …).
 * Keep only real option surfaces — picker chrome or a highlighted choice —
 * so chat Enter is not stolen after a failed turn paints the PTY.
 * @param below - rows collected under the input bar.
 * @returns option-surface rows, or an empty list.
 */
function keepOptionSurface(below: readonly MirrorBelowLine[]): MirrorBelowLine[] {
  const options = below.filter(line => !isCliStatusChrome(line.text))
  if (options.some(line => line.highlighted || isCliPickerChrome(line.text))) {
    return options
  }
  return []
}

function lastBarRow(snapshot: ScreenSnapshot, promptRow: number): number {
  const barBg = snapshot.barBgRows ?? snapshot.lightBgRows
  let end = promptRow
  while (end + 1 < snapshot.lines.length) {
    const next = end + 1
    if (barBg?.[next] !== true) break
    if (rowHighlighted(snapshot, next)) break
    // Wrapped draft rows share bar paint; picker / option rows must not.
    if (isPickerSurfaceRow(snapshot.lines[next] ?? '')) break
    end = next
  }
  return end
}

function rowHighlighted(snapshot: ScreenSnapshot, index: number): boolean {
  return snapshot.reverseRows[index] === true || snapshot.accentRows[index] === true
}

/**
 * Index of the CLI input-bar row, or `undefined` when none is visible.
 *
 * Gray-bar paint is authoritative. Cursor position never overrides paint —
 * the cursor sits on the selected option while a picker is open.
 * @param lines - screen rows.
 * @param cursorRow - optional cursor row from the screen buffer.
 * @param reverseRows - optional per-row reverse-video flags.
 * @param barBgRows - optional per-row input-bar background flags.
 * @param accentRows - optional per-row colored-selection flags.
 * @returns prompt row index.
 */
export function findPromptRow(
  lines: readonly string[],
  cursorRow?: number,
  reverseRows?: readonly boolean[],
  barBgRows?: readonly boolean[],
  accentRows?: readonly boolean[],
): number | undefined {
  const bar = findBarBgPromptRow(lines, reverseRows, barBgRows, accentRows)
  if (bar !== undefined) return bar

  const kindAt = (index: number): PromptKind => (
    promptRowKind(lines[index] ?? '', reverseRows?.[index] === true)
  )
  const slash = findKind(lines, kindAt, 'slash')
  const empty = findKind(lines, kindAt, 'empty')
  const pickerOpen = lines.some(line => (
    isCliPickerChrome(line) || /^\s*Available models\b/iu.test(line)
  ))

  // Cursor tracks the highlighted option while a menu is open — never prefer a
  // reverse/accent row, and only accept a true slash draft or empty bar.
  if (
    cursorRow !== undefined
    && reverseRows?.[cursorRow] !== true
    && accentRows?.[cursorRow] !== true
  ) {
    const kind = kindAt(cursorRow)
    if (kind === 'slash' || kind === 'empty') return cursorRow
  }

  const tip = findKind(lines, kindAt, 'tip')
  // While a below-prompt picker is open, the CLI often keeps the home tip or a
  // slash/empty draft as the bar above the panel. Option labels (`bare`) must
  // never become the bar — the cursor sits on those rows during navigation.
  // Restrict candidates to rows above the option panel so a misclassified
  // option (model title, keyed row) cannot win a bottom-up empty/slash scan.
  if (pickerOpen) {
    const chromeAt = lines.findIndex(line => isCliPickerChrome(line))
    const headerAt = lines.findIndex(line => /^\s*Available models\b/iu.test(line))
    const surface = minDefinedIndex(headerAt, chromeAt)
    const above = (index: number | undefined): number | undefined => (
      index !== undefined && (surface < 0 || index < surface) ? index : undefined
    )
    return above(slash) ?? above(empty) ?? above(tip)
  }
  const bare = findKind(lines, kindAt, 'bare')
  return slash ?? empty ?? bare ?? tip
}

/**
 * Uppermost gray-bar row that is not reverse/accent selected option paint.
 * Cursor is ignored: it tracks the highlighted option, not the input bar.
 * While a picker is open, gray washes on option rows (Ink often reuses the
 * same elevated gray as the composer) must not locate the bar.
 * @returns bar row index, or undefined.
 */
function findBarBgPromptRow(
  lines: readonly string[],
  reverseRows: readonly boolean[] | undefined,
  barBgRows: readonly boolean[] | undefined,
  accentRows: readonly boolean[] | undefined,
): number | undefined {
  if (barBgRows === undefined) return undefined
  const pickerOpen = lines.some(line => (
    isCliPickerChrome(line) || /^\s*Available models\b/iu.test(line)
  ))
  for (let i = 0; i < lines.length; i += 1) {
    if (barBgRows[i] !== true) continue
    if (reverseRows?.[i] === true) continue
    if (accentRows?.[i] === true) continue
    const trimmed = (lines[i] ?? '').trimEnd()
    if (isSlashOptionRow(trimmed)) continue
    if (/^\s*\[[a-z0-9]\]\s+\S/iu.test(trimmed)) continue
    // Selected model titles often reuse composer gray paint — skip them while
    // a picker is open. Idle `→ Auto` chips still locate the bar (no picker).
    if (pickerOpen && isPickerOptionLabelRow(trimmed)) continue
    // Status chrome may occupy the gray bar during a live turn — still locate
    // the bar here; extractPromptMirror clears the draft text.
    return i
  }
  return undefined
}

/** Smallest non-negative index, or `-1` when both are missing. */
function minDefinedIndex(a: number, b: number): number {
  if (a < 0) return b
  if (b < 0) return a
  return Math.min(a, b)
}

/**
 * True when a row is a selectable option label (model title, keyed choice,
 * slash option) rather than composer draft / status chrome.
 * @param line - one screen row.
 */
function isPickerOptionLabelRow(line: string): boolean {
  const trimmed = line.trimEnd()
  if (trimmed.length === 0) return false
  if (isSlashOptionRow(trimmed)) return true
  if (/^\s*\[[a-z0-9]\]\s+\S/iu.test(trimmed)) return true
  const rest = stripPromptGlyph(trimmed)
  if (isBareModelTitle(rest)) return true
  return false
}

/**
 * True when extending the gray bar would swallow picker / option rows.
 * @param line - candidate row below the current bar end.
 */
function isPickerSurfaceRow(line: string): boolean {
  const trimmed = line.trimEnd()
  if (trimmed.length === 0) return false
  if (isCliPickerChrome(trimmed)) return true
  if (/^\s*Available models\b/iu.test(trimmed)) return true
  return isPickerOptionLabelRow(trimmed)
}

function fullscreenPickerStart(lines: readonly string[]): number {
  let start = 0
  while (start < lines.length && isLeadingCliHeader(lines[start] ?? '')) start += 1
  return start
}

function isLeadingCliHeader(line: string): boolean {
  const text = line.trim()
  if (text.length === 0) return true
  if (/^Cursor Agent\b/u.test(text)) return true
  if (/^v\d/u.test(text)) return true
  if (/^Tip:/u.test(text)) return true
  if (/^─{8,}/u.test(text)) return true
  return false
}

function findKind(
  lines: readonly string[],
  kindAt: (index: number) => PromptKind,
  want: PromptKind,
): number | undefined {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (kindAt(i) === want) return i
  }
  return undefined
}

/**
 * Encode a browser key event into PTY bytes (CSI for arrows, DEL for Backspace).
 * @param key - `KeyboardEvent.key`.
 * @param mods - modifier flags from the browser event.
 * @returns bytes to write, or `undefined` when the key is not forwarded.
 */
export function encodeBrowserKey(
  key: string,
  mods: { ctrl?: boolean; alt?: boolean; meta?: boolean },
): string | undefined {
  if (mods.meta === true || mods.alt === true) return undefined
  if (mods.ctrl === true) {
    if (key === 'c' || key === 'C') return '\x03'
    if (key === 'u' || key === 'U') return '\x15'
    if (key === 'a' || key === 'A') return '\x01'
    if (key === 'e' || key === 'E') return '\x05'
    if (key === 'w' || key === 'W') return '\x17'
    return undefined
  }
  switch (key) {
    case 'ArrowUp': return '\x1b[A'
    case 'ArrowDown': return '\x1b[B'
    case 'ArrowRight': return '\x1b[C'
    case 'ArrowLeft': return '\x1b[D'
    case 'Enter': return '\r'
    case 'Escape': return '\x1b'
    case 'Backspace': return '\x7f'
    case 'Tab': return '\t'
    case 'Delete': return '\x1b[3~'
    case 'Home': return '\x1b[H'
    case 'End': return '\x1b[F'
    default:
      break
  }
  if (key.length === 1) return key
  return undefined
}

function promptRowKind(line: string, reverse: boolean): PromptKind {
  const trimmed = line.trimEnd()
  if (trimmed.length === 0) return 'none'
  if (isSlashOptionRow(trimmed)) return 'none'
  if (/^\s*\[[a-z0-9]\]\s+\S/iu.test(trimmed)) return 'none'
  if (SLASH_DRAFT.test(trimmed.trim())) return 'slash'
  if (!new RegExp(String.raw`${PROMPT_MARK}`, 'u').test(trimmed)) return 'none'
  const rest = stripPromptGlyph(trimmed)
  if (rest.length === 0) return 'empty'
  // Approval / tip / meter / path chrome on the bar still counts as empty (the
  // mirror clears the draft). Bare model titles must not — they are also
  // `/model` list options, and a bottom-up `empty` scan would steal the bar.
  if (isCliStatusChrome(rest)) {
    if (isBareModelTitle(rest)) return 'none'
    return 'empty'
  }
  // Option rows with truncated `[arg…` still carry a description column.
  if (isSlashOptionRow(rest) || (rest.startsWith('/') && /\s{2,}\S/u.test(rest))) {
    return 'none'
  }
  if (rest.startsWith('/')) return 'slash'
  if (isHomeTipSlogan(rest)) return 'tip'
  if (reverse) return 'none'
  if (/\s{2,}\S/u.test(rest)) return 'none'
  return 'bare'
}

/**
 * Ink slash-menu option — not an incomplete draft on the input bar.
 * Matches a description column (`/cmd …  desc`) and `/cmd` followed by
 * `[args]`, `<args>`, or `(note)` — including truncated opening brackets.
 * @param line - screen row, with or without a prompt glyph.
 */
function isSlashOptionRow(line: string): boolean {
  const text = stripPromptGlyph(line.trimEnd())
  if (!text.startsWith('/')) return false
  if (SLASH_DRAFT.test(text)) return false
  if (/\s{2,}\S/u.test(text)) return true
  return /^\/[a-z0-9_-]+\s+[\[<(]/iu.test(text)
}

/** Draft text for the composer: empty while the idle home tip occupies the bar. */
function promptDraftText(line: string): string {
  const rest = stripPromptGlyph(line)
  if (isHomeTipSlogan(rest)) return ''
  return rest
}

function isHomeTipSlogan(rest: string): boolean {
  return /^plan\b/iu.test(rest) && /,/u.test(rest)
}

/**
 * True when a row is a Cursor abort / transport-failure banner, not a draft.
 * @param text - already glyph-stripped row text.
 */
function isCliAbortChrome(text: string): boolean {
  if (/^Error:\s*\[/iu.test(text)) return true
  if (/\bECONNRESET\b/iu.test(text)) return true
  return false
}

/**
 * True when a row is CLI option-list chrome rather than conversation text.
 *
 * Shared by prompt-row location and transcript harvest. Matches Ink picker
 * footers, keyed `[y]`/`[n]` rows, a lone `Filter:` field, and two-column
 * slash option lines — never a specific command name.
 * @param line - one screen row.
 * @returns whether the row is picker chrome.
 */
export function isCliPickerChrome(line: string): boolean {
  const text = line.trimEnd()
  if (isSlashOptionRow(text)) return true
  if (/^\s*\[[a-z0-9]\]\s+\S/iu.test(text)) return true
  if (/^\s*Filter:\s*$/iu.test(text)) return true
  if (/Type to filter/iu.test(text)) return true
  if (/Enter to select/iu.test(text)) return true
  if (/Enter to submit/iu.test(text)) return true
  if (/press the key shown/iu.test(text)) return true
  if (/↑↓/u.test(text)) return true
  return false
}

/**
 * True when a row is Cursor CLI chrome rather than conversation text.
 *
 * Covers live-turn status, approval-mode hints, and model·cwd footers that Ink
 * paints into the prompt region. Shared by mirror draft extraction and
 * transcript harvest; use {@link isCliTurnChrome} when deciding whether a turn
 * is still running.
 * @param line - one screen row (prompt glyph optional).
 * @returns whether the row is status chrome.
 */
export function isCliStatusChrome(line: string): boolean {
  const text = stripPromptGlyph(line.trim())
  if (text.length === 0) return false
  if (isCliTurnChrome(text)) return true
  if (isCliUsageChrome(text)) return true
  // Bare model chip on the gray bar after a turn (`Auto`) — not a user draft.
  if (/^Auto$/iu.test(text)) return true
  // Model + CLI version fragments that linger beside/after Working.
  if (/^Auto\s*v?\d{4}\.\d{2}\.\d{2}/iu.test(text)) return true
  if (/^v\d{4}\.\d{2}\.\d{2}-[0-9a-f]+\b/iu.test(text)) return true
  // Idle home tip on the bar (`Plan, search, build anything`) — mirror clears
  // it via promptDraftText; harvest/idle must treat it as chrome too.
  if (isHomeTipSlogan(text)) return true
  // Idle / composing tips — strip from harvest, but do not pin `running`
  // (see {@link isCliTurnChrome}).
  if (/\bAdd a follow-up\b/iu.test(text)) return true
  if (/\bctrl\+c to stop\b/iu.test(text)) return true
  if (/\bto switch approval\b/iu.test(text)) return true
  if (/^[←→\/\\\s]+to switch approval\b/iu.test(text)) return true
  // Failed-turn banners (`Error: [aborted] read ECONNRESET`) paint on the
  // gray bar; they are not a composer draft or a picker.
  if (isCliAbortChrome(text)) return true
  // Composer-* model·cwd / meter footers are covered by usage + path / branch
  // rules below. Do not match a bare `Composer 2.5 Fast` title — that string is
  // also a `/model` list option and must not relocate the input bar.
  // Model·cwd footers are often right-padded and wrap mid-path; match the
  // head, a bare Windows path, and `· branch` continuations.
  if (/^[·•]/u.test(text)) return true
  if (/[·•]\s*(master|main|HEAD)\b/iu.test(text)) return true
  if (/^[A-Za-z]:[\\/]/u.test(text)) return true
  if (/[/\\].*·\s*(master|main|HEAD)\b/iu.test(text)) return true
  return false
}

/**
 * True when status-chrome text is only a bare model title (bar chip or list option).
 * Footers with `·`, `%`, or paths are not bare titles.
 * @param text - already glyph-stripped row text.
 */
function isBareModelTitle(text: string): boolean {
  const compact = text.replace(/\s+/gu, ' ').trim()
  if (compact.length === 0) return false
  if (/^Auto$/iu.test(compact)) return true
  if (/[·•%/\\:]/u.test(compact)) return false
  if (/\b(follow-up|switch approval|ctrl\+c)\b/iu.test(compact)) return false
  if (isHomeTipSlogan(compact) || isCliTurnChrome(compact)) return false
  // CLI model-list labels — family token plus version/size, never arbitrary drafts.
  if (!/^(Composer|Cursor|Gemini|Kimi|GLM|Claude|GPT|o\d)\b/iu.test(compact)) {
    return false
  }
  return /^[A-Za-z][\w .()+-]{0,60}$/u.test(compact)
}

/**
 * True when a row is a model / context-meter footer (`Auto · 9.3%`).
 * May repeat on one wrapped line; never conversation text.
 * @param text - already trimmed / glyph-stripped row text.
 */
function isCliUsageChrome(text: string): boolean {
  const compact = text.replace(/\s+/gu, ' ').trim()
  if (compact.length === 0) return false
  // One or more `Model · N%` tokens (Ink sometimes paints the meter twice).
  const meter = String.raw`[A-Za-z][\w .+-]{0,40}?\s*[·•]\s*\d+(?:\.\d+)?%`
  if (new RegExp(String.raw`^(?:${meter}\s*)+$`, 'u').test(compact)) return true
  if (new RegExp(String.raw`^${meter}\b`, 'u').test(compact) && compact.length < 96) return true
  return false
}

/**
 * True when a row shows an in-flight Cursor CLI turn (not idle approval chrome).
 * @param line - one screen row (prompt glyph optional).
 * @returns whether the row keeps the overlay in `running`.
 */
export function isCliTurnChrome(line: string): boolean {
  const text = stripPromptGlyph(line.trim())
  if (text.length === 0) return false
  // Ink paints a leading spinner glyph that changes every frame.
  const status = text.replace(/^[^\p{L}\p{N}]+/u, '').trim()
  // ONLY live-turn verbs. Model/version footers and follow-up tips linger after
  // the reply — they are status chrome for harvest, not busy pins.
  if (/^Composing\b/iu.test(status)) return true
  if (/^Working\b/iu.test(status)) return true
  if (/^Generating\b/iu.test(status)) return true
  if (/^Thinking\b/iu.test(status)) return true
  return false
}

function stripPromptGlyph(line: string): string {
  return line.trimEnd().replace(PROMPT_GLYPH, '')
}
