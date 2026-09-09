/** Lightweight VT screen buffer for Ink-style option-surface extraction. */

/** One cell in the screen grid. */
export type ScreenCell = {
  /** Display character (one JS string unit). */
  char: string
  /** True when SGR reverse video is active. */
  reverse: boolean
  /**
   * True when the cell has the elevated gray input-bar background (dark or light
   * gray against black chrome — not default/black, not a colored selection).
   */
  barBg: boolean
  /**
   * True when the cell has a non-gray colored background (selection wash).
   * Reverse video is tracked separately.
   */
  accent: boolean
}

/** Snapshot of the buffer as plain lines plus row attribute flags. */
export type ScreenSnapshot = {
  /** Rows of visible text (trailing spaces trimmed). */
  readonly lines: readonly string[]
  /** Rows where any cell has reverse video. */
  readonly reverseRows: readonly boolean[]
  /**
   * Rows painted with the CLI input-bar gray background (elevated from black).
   * This is the stable locator for the composer mirror.
   */
  readonly barBgRows: readonly boolean[]
  /** @deprecated Alias of {@link barBgRows}; kept for call-site migration. */
  readonly lightBgRows: readonly boolean[]
  /** Rows where any cell has a non-gray colored background. */
  readonly accentRows: readonly boolean[]
  /** 0-based cursor row. */
  readonly cursorRow: number
  /** 0-based cursor column. */
  readonly cursorCol: number
}

type CellBg =
  | { readonly mode: 'default' }
  | { readonly mode: 'ansi'; readonly code: number }
  | { readonly mode: 'xterm'; readonly index: number }
  | { readonly mode: 'rgb'; readonly r: number; readonly g: number; readonly b: number }

/**
 * Maintain a fixed-size character grid while consuming PTY stdout chunks.
 * Supports the CSI subset Ink uses for menus (CUP, CHA, CNL/CPL, VPA, CUU/CUD/CUF/CUB,
 * ED, EL, IL/DL, ICH/DCH, SU/SD, save/restore, SGR).
 */
export class ScreenBuffer {
  private cols: number
  private rows: number
  private cells: ScreenCell[][]
  private cursorRow = 0
  private cursorCol = 0
  private reverse = false
  private bg: CellBg = { mode: 'default' }
  private savedRow = 0
  private savedCol = 0
  /**
   * xterm deferred wrap: writing the last column does not advance until the
   * next printable character. Immediate wrap + `\r\n` skips a row and leaves
   * slash-menu ghosts (duplicate `/ask` after scroll).
   */
  private wrapPending = false
  private parseState: 'ground' | 'esc' | 'csi' | 'osc' = 'ground'
  private csi = ''
  private osc = ''

  /**
   * @param cols - terminal width in columns.
   * @param rows - terminal height in rows.
   */
  constructor(cols = 80, rows = 24) {
    this.cols = Math.max(1, cols)
    this.rows = Math.max(1, rows)
    this.cells = blankGrid(this.cols, this.rows)
  }

  /**
   * Feed raw PTY bytes (UTF-16 string chunks from node-pty).
   * @param chunk - next stdout fragment.
   */
  write(chunk: string): void {
    for (const ch of chunk) {
      this.consume(ch)
    }
  }

  /**
   * Resize the grid; content in the overlapping region is preserved.
   * @param cols - new width.
   * @param rows - new height.
   */
  resize(cols: number, rows: number): void {
    const nextCols = Math.max(1, cols)
    const nextRows = Math.max(1, rows)
    const next = blankGrid(nextCols, nextRows)
    const copyRows = Math.min(this.rows, nextRows)
    const copyCols = Math.min(this.cols, nextCols)
    for (let r = 0; r < copyRows; r += 1) {
      for (let c = 0; c < copyCols; c += 1) {
        next[r]![c] = { ...this.cells[r]![c]! }
      }
    }
    this.cols = nextCols
    this.rows = nextRows
    this.cells = next
    this.cursorRow = Math.min(this.cursorRow, nextRows - 1)
    this.cursorCol = Math.min(this.cursorCol, nextCols - 1)
  }

  /**
   * Capture the current grid as trimmed lines plus reverse / bar-bg / accent flags.
   * @returns a snapshot safe for prompt-mirror parsing.
   */
  snapshot(): ScreenSnapshot {
    const lines: string[] = []
    const reverseRows: boolean[] = []
    const barBgRows: boolean[] = []
    const accentRows: boolean[] = []
    // The painted pill is often only as wide as the draft plus padding — not 12%
    // of a 100-col PTY. Three gray cells is enough to reject stray SGR crumbs.
    const barThreshold = 3
    for (let r = 0; r < this.rows; r += 1) {
      let reverse = false
      let accent = false
      let barCount = 0
      let raw = ''
      for (let c = 0; c < this.cols; c += 1) {
        const cell = this.cells[r]![c]!
        if (cell.reverse) reverse = true
        if (cell.accent) accent = true
        if (cell.barBg) barCount += 1
        raw += cell.char
      }
      lines.push(raw.replace(/\s+$/u, ''))
      reverseRows.push(reverse)
      barBgRows.push(barCount >= barThreshold)
      accentRows.push(accent)
    }
    return {
      lines,
      reverseRows,
      barBgRows,
      lightBgRows: barBgRows,
      accentRows,
      cursorRow: this.cursorRow,
      cursorCol: this.cursorCol,
    }
  }

  private consume(ch: string): void {
    if (this.parseState === 'ground') {
      if (ch === '\x1b') {
        this.parseState = 'esc'
        return
      }
      if (ch === '\r') {
        this.wrapPending = false
        this.cursorCol = 0
        return
      }
      if (ch === '\n') {
        this.wrapPending = false
        this.lineFeed()
        return
      }
      if (ch === '\b') {
        this.wrapPending = false
        this.cursorCol = Math.max(0, this.cursorCol - 1)
        return
      }
      if (ch === '\t') {
        this.wrapPending = false
        const next = Math.min(this.cols - 1, (Math.floor(this.cursorCol / 8) + 1) * 8)
        this.cursorCol = next
        return
      }
      if (ch < ' ' && ch !== '\n') return
      this.put(ch)
      return
    }
    if (this.parseState === 'esc') {
      if (ch === '[') {
        this.parseState = 'csi'
        this.csi = ''
        return
      }
      if (ch === ']') {
        this.parseState = 'osc'
        this.osc = ''
        return
      }
      if (ch === '7') {
        this.wrapPending = false
        this.saveCursor()
        this.parseState = 'ground'
        return
      }
      if (ch === '8') {
        this.wrapPending = false
        this.restoreCursor()
        this.parseState = 'ground'
        return
      }
      this.parseState = 'ground'
      return
    }
    if (this.parseState === 'osc') {
      if (ch === '\x07' || ch === '\x1b') {
        if (ch === '\x1b') this.parseState = 'esc'
        else this.parseState = 'ground'
        this.osc = ''
        return
      }
      this.osc += ch
      /* v8 ignore start -- BEL/\x1b already terminate OSC above; ST form kept for completeness. */
      if (this.osc.endsWith('\x1b\\')) {
        this.parseState = 'ground'
        this.osc = ''
      }
      /* v8 ignore stop */
      return
    }
    // csi parameter / intermediate bytes (incl. `:` RGB and `>` private prefixes)
    if (
      (ch >= '0' && ch <= '9')
      || ch === ';'
      || ch === '?'
      || ch === ':'
      || ch === '>'
      || ch === ' '
      || (ch >= '<' && ch <= '?')
    ) {
      this.csi += ch
      return
    }
    this.applyCsi(ch, this.csi)
    this.csi = ''
    this.parseState = 'ground'
  }

  private applyCsi(final: string, params: string): void {
    const nums = expandCsiParams(params)
    const first = nums[0] ?? 0
    // Cursor motion / erase cancels a deferred wrap without synthesizing a LF.
    if (
      final === 'A' || final === 'B' || final === 'C' || final === 'D'
      || final === 'H' || final === 'f' || final === 'G' || final === 'd'
      || final === 'E' || final === 'F' || final === 'J' || final === 'K'
      || final === 'L' || final === 'M' || final === 'P' || final === '@'
      || final === 'S' || final === 'T' || final === 's' || final === 'u'
    ) {
      this.wrapPending = false
    }
    switch (final) {
      case 'A':
        this.cursorRow = Math.max(0, this.cursorRow - Math.max(1, first || 1))
        break
      case 'B':
        this.cursorRow = Math.min(this.rows - 1, this.cursorRow + Math.max(1, first || 1))
        break
      case 'C':
        this.cursorCol = Math.min(this.cols - 1, this.cursorCol + Math.max(1, first || 1))
        break
      case 'D':
        this.cursorCol = Math.max(0, this.cursorCol - Math.max(1, first || 1))
        break
      case 'H':
      case 'f': {
        const row = Math.max(1, nums[0] ?? 1) - 1
        const col = Math.max(1, nums[1] ?? 1) - 1
        this.cursorRow = Math.min(this.rows - 1, row)
        this.cursorCol = Math.min(this.cols - 1, col)
        break
      }
      case 'G':
        this.cursorCol = Math.min(this.cols - 1, Math.max(0, (first || 1) - 1))
        break
      case 'd':
        this.cursorRow = Math.min(this.rows - 1, Math.max(0, (first || 1) - 1))
        break
      case 'E':
        this.cursorRow = Math.min(this.rows - 1, this.cursorRow + Math.max(1, first || 1))
        this.cursorCol = 0
        break
      case 'F':
        this.cursorRow = Math.max(0, this.cursorRow - Math.max(1, first || 1))
        this.cursorCol = 0
        break
      case 's':
        this.saveCursor()
        break
      case 'u':
        this.restoreCursor()
        break
      case 'L':
        this.insertLines(Math.max(1, first || 1))
        break
      case 'M':
        this.deleteLines(Math.max(1, first || 1))
        break
      case 'P':
        this.deleteChars(Math.max(1, first || 1))
        break
      case '@':
        this.insertChars(Math.max(1, first || 1))
        break
      case 'S':
        this.scrollUp(Math.max(1, first || 1))
        break
      case 'T':
        this.scrollDown(Math.max(1, first || 1))
        break
      case 'J': {
        const mode = first
        if (mode === 2 || mode === 3) {
          this.cells = blankGrid(this.cols, this.rows)
          this.cursorRow = 0
          this.cursorCol = 0
        } else if (mode === 0) {
          this.clearFromCursor()
        } else if (mode === 1) {
          this.clearToCursor()
        }
        break
      }
      case 'K': {
        const mode = first
        const row = this.cells[this.cursorRow]!
        if (mode === 2) {
          for (let c = 0; c < this.cols; c += 1) row[c] = blankCell()
        } else if (mode === 1) {
          for (let c = 0; c <= this.cursorCol; c += 1) row[c] = blankCell()
        } else {
          for (let c = this.cursorCol; c < this.cols; c += 1) row[c] = blankCell()
        }
        break
      }
      case 'm':
        this.applySgr(nums.length === 0 ? [0] : nums)
        break
      default:
        break
    }
  }

  private applySgr(nums: readonly number[]): void {
    let i = 0
    while (i < nums.length) {
      const n = nums[i]!
      if (n === 0) {
        this.reverse = false
        this.bg = { mode: 'default' }
        i += 1
        continue
      }
      if (n === 7) {
        this.reverse = true
        i += 1
        continue
      }
      if (n === 27) {
        this.reverse = false
        i += 1
        continue
      }
      if (n === 49) {
        this.bg = { mode: 'default' }
        i += 1
        continue
      }
      if (n >= 40 && n <= 47) {
        this.bg = { mode: 'ansi', code: n }
        i += 1
        continue
      }
      if (n >= 100 && n <= 107) {
        this.bg = { mode: 'ansi', code: n }
        i += 1
        continue
      }
      if (n === 48) {
        const sel = nums[i + 1]
        if (sel === 5 && nums[i + 2] !== undefined) {
          this.bg = { mode: 'xterm', index: nums[i + 2]! }
          i += 3
          continue
        }
        if (sel === 2 && nums[i + 4] !== undefined) {
          this.bg = {
            mode: 'rgb',
            r: nums[i + 2]!,
            g: nums[i + 3]!,
            b: nums[i + 4]!,
          }
          i += 5
          continue
        }
        i += 1
        continue
      }
      if (n === 38) {
        const sel = nums[i + 1]
        if (sel === 5) {
          i += 3
          continue
        }
        if (sel === 2) {
          i += 5
          continue
        }
        i += 1
        continue
      }
      i += 1
    }
  }

  private put(ch: string): void {
    if (this.wrapPending) {
      this.wrapPending = false
      this.cursorCol = 0
      this.lineFeed()
    }
    const row = this.cells[this.cursorRow]!
    row[this.cursorCol] = {
      char: ch,
      reverse: this.reverse,
      barBg: isInputBarBackground(this.bg),
      accent: isAccentBackground(this.bg),
    }
    if (this.cursorCol + 1 >= this.cols) {
      // Stay on the last column; the next printable char performs the wrap.
      this.wrapPending = true
    } else {
      this.cursorCol += 1
    }
  }

  private lineFeed(): void {
    if (this.cursorRow + 1 < this.rows) {
      this.cursorRow += 1
      return
    }
    this.cells.shift()
    this.cells.push(blankRow(this.cols))
  }

  private clearFromCursor(): void {
    const row = this.cells[this.cursorRow]!
    for (let c = this.cursorCol; c < this.cols; c += 1) row[c] = blankCell()
    for (let r = this.cursorRow + 1; r < this.rows; r += 1) {
      this.cells[r] = blankRow(this.cols)
    }
  }

  private clearToCursor(): void {
    for (let r = 0; r < this.cursorRow; r += 1) {
      this.cells[r] = blankRow(this.cols)
    }
    const row = this.cells[this.cursorRow]!
    for (let c = 0; c <= this.cursorCol; c += 1) row[c] = blankCell()
  }

  private saveCursor(): void {
    this.savedRow = this.cursorRow
    this.savedCol = this.cursorCol
  }

  private restoreCursor(): void {
    this.cursorRow = Math.min(this.savedRow, this.rows - 1)
    this.cursorCol = Math.min(this.savedCol, this.cols - 1)
  }

  private insertLines(count: number): void {
    const extra = Array.from({ length: count }, () => blankRow(this.cols))
    this.cells.splice(this.cursorRow, 0, ...extra)
    this.cells.length = this.rows
  }

  private deleteLines(count: number): void {
    this.cells.splice(this.cursorRow, count)
    while (this.cells.length < this.rows) this.cells.push(blankRow(this.cols))
  }

  private insertChars(count: number): void {
    const row = this.cells[this.cursorRow]!
    row.splice(this.cursorCol, 0, ...Array.from({ length: count }, () => blankCell()))
    row.length = this.cols
  }

  private deleteChars(count: number): void {
    const row = this.cells[this.cursorRow]!
    row.splice(this.cursorCol, count)
    while (row.length < this.cols) row.push(blankCell())
    row.length = this.cols
  }

  private scrollUp(count: number): void {
    for (let i = 0; i < count; i += 1) {
      this.cells.shift()
      this.cells.push(blankRow(this.cols))
    }
  }

  private scrollDown(count: number): void {
    for (let i = 0; i < count; i += 1) {
      this.cells.pop()
      this.cells.unshift(blankRow(this.cols))
    }
  }
}

/**
 * Expand CSI parameters, flattening both `;` and `:` separators
 * (`48;5;250` and `48:2:200:200:200`).
 * @param params - raw CSI parameter string.
 * @returns numeric parameter list.
 */
export function expandCsiParams(params: string): number[] {
  if (params.length === 0) return []
  const out: number[] = []
  for (const part of params.split(';')) {
    if (part.includes(':')) {
      for (const sub of part.split(':')) {
        const n = Number.parseInt(sub, 10)
        out.push(Number.isFinite(n) ? n : 0)
      }
      continue
    }
    const n = Number.parseInt(part, 10)
    out.push(Number.isFinite(n) ? n : 0)
  }
  return out
}

/**
 * Whether an SGR background is the CLI input-bar gray paint.
 * The bar is an elevated gray strip on black chrome — often **dark** gray in
 * the product theme, not a bright/light wash. Saturated colors (green/blue
 * selection) are never the bar.
 * @param bg - decoded background.
 * @returns true for input-bar backgrounds.
 */
export function isInputBarBackground(bg: CellBg): boolean {
  if (bg.mode === 'default') return false
  if (bg.mode === 'ansi') {
    // 47 white, 100 bright-black/dark-gray, 107 bright-white. Not 40 black,
    // not 41–46 / 101–106 chromatic selection paints.
    return bg.code === 47 || bg.code === 100 || bg.code === 107
  }
  if (bg.mode === 'xterm') {
    if (bg.index === 7 || bg.index === 8 || bg.index === 15) return true
    if (bg.index === 0 || bg.index === 16) return false
    if (bg.index >= 232) {
      const level = 8 + (bg.index - 232) * 10
      return level >= 28
    }
    if (bg.index >= 16 && bg.index <= 231) {
      const i = bg.index - 16
      const r = cubeLevel(Math.floor(i / 36))
      const g = cubeLevel(Math.floor((i % 36) / 6))
      const b = cubeLevel(i % 6)
      return isGrayPaint(r, g, b)
    }
    return false
  }
  return isGrayPaint(bg.r, bg.g, bg.b)
}

/**
 * Whether an SGR background is a colored selection wash (not the gray bar).
 * @param bg - decoded background.
 * @returns true for non-gray, non-default, non-black paints.
 */
export function isAccentBackground(bg: CellBg): boolean {
  if (bg.mode === 'default') return false
  if (isInputBarBackground(bg)) return false
  if (bg.mode === 'ansi') return bg.code !== 40
  if (bg.mode === 'xterm') {
    if (bg.index === 0 || bg.index === 16) return false
    if (bg.index >= 232) return false
    return true
  }
  const luminance = 0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b
  return luminance >= 22
}

/** @deprecated Use {@link isInputBarBackground}. */
export const isLightBackground = isInputBarBackground

function cubeLevel(n: number): number {
  return n === 0 ? 0 : 55 + n * 40
}

function isGrayPaint(r: number, g: number, b: number): boolean {
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  if (luminance < 22) return false
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return (max - min) / max <= 0.22
}

function blankGrid(cols: number, rows: number): ScreenCell[][] {
  return Array.from({ length: rows }, () => blankRow(cols))
}

function blankRow(cols: number): ScreenCell[] {
  return Array.from({ length: cols }, () => blankCell())
}

function blankCell(): ScreenCell {
  return { char: ' ', reverse: false, barBg: false, accent: false }
}
