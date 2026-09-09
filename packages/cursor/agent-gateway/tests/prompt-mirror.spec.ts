import { describe, expect, it } from 'vitest'
import {
  encodeBrowserKey,
  extractAskQuestionMirror,
  extractPromptMirror,
  findPromptRow,
  isAskQuestionChrome,
  isCliPickerChrome,
  isCliStatusChrome,
  isCliTurnChrome,
} from '../src/prompt-mirror.ts'
import { ScreenBuffer } from '../src/screen-buffer.ts'

function snap(input: {
  lines: string[]
  reverseRows?: boolean[]
  barBgRows?: boolean[]
  lightBgRows?: boolean[]
  accentRows?: boolean[]
  cursorRow: number
  cursorCol?: number
}) {
  const n = input.lines.length
  const bar = input.barBgRows
    ?? input.lightBgRows
    ?? Array.from({ length: n }, () => false)
  const none = Array.from({ length: n }, () => false)
  return {
    lines: input.lines,
    reverseRows: input.reverseRows ?? none,
    barBgRows: bar,
    lightBgRows: bar,
    accentRows: input.accentRows ?? none,
    cursorRow: input.cursorRow,
    cursorCol: input.cursorCol ?? 0,
  }
}

describe('ScreenBuffer', () => {
  it('applies CUP and SGR reverse for a synthetic slash menu frame', () => {
    const screen = new ScreenBuffer(40, 8)
    screen.write('\x1b[2J\x1b[H')
    screen.write('→ /\n')
    screen.write('→ /model [filter]           Select model\n')
    screen.write('/ask                      Toggle ask\n')
    const frame = screen.snapshot()
    expect(frame.lines.some(line => line.includes('/model'))).toBe(true)
  })

  it('marks elevated gray background rows as the input bar paint', () => {
    const screen = new ScreenBuffer(40, 8)
    screen.write('\x1b[2J\x1b[H')
    screen.write('black chrome\r\n')
    // Product theme uses a dark-gray bar (not bright/light wash).
    screen.write('\x1b[48;2;58;58;62m')
    screen.write('→ hello world')
    screen.write('             ')
    screen.write('\x1b[49m\r\n')
    screen.write('Type to filter\r\n')
    const frame = screen.snapshot()
    expect(frame.lines[0]).toContain('black chrome')
    expect(frame.barBgRows[0]).toBe(false)
    expect(frame.barBgRows[1]).toBe(true)
    const mirror = extractPromptMirror(frame)
    expect(mirror.input).toBe('hello world')
    expect(mirror.below.some(row => row.text.includes('Type to filter'))).toBe(true)
  })

  it('keeps the gray bar as input while a green-arrow option is selected below', () => {
    const mirror = extractPromptMirror(snap({
      lines: [
        '→ Plan, search, build anything',
        'Available models',
        '→ Kimi K2.7 Code',
        '  GLM 5.2 High',
        'Type to filter • Enter to select • Tab to edit',
      ],
      reverseRows: [false, false, false, false, false],
      barBgRows: [true, false, false, false, false],
      cursorRow: 2,
      cursorCol: 2,
    }))
    expect(mirror.input).toBe('')
    expect(mirror.below.some(row => row.text.includes('Kimi K2.7 Code'))).toBe(true)
  })
})

describe('extractPromptMirror', () => {
  it('mirrors input-bar text and every non-empty row below it', () => {
    const mirror = extractPromptMirror(snap({
      lines: [
        '  Tip: hello',
        '  → /',
        '   → /model [filter]           Select model (Tab to edit)',
        '     /goal [objective]         Start a durable goal',
        '     ↓ more below',
      ],
      reverseRows: [false, false, true, false, false],
      cursorRow: 1,
      cursorCol: 5,
    }))
    expect(mirror.input).toBe('/')
    expect(mirror.below.map(row => row.text)).toEqual([
      '   → /model [filter]           Select model (Tab to edit)',
      '     /goal [objective]         Start a durable goal',
      '     ↓ more below',
    ])
    expect(mirror.below[0]?.highlighted).toBe(true)
  })

  it('skips CLI header chrome when a full-screen picker has no input bar', () => {
    const mirror = extractPromptMirror(snap({
      lines: [
        'Cursor Agent tip chrome',
        'v2026.08.25-3e8eec8',
        'Tip: Type ? in the prompt bar',
        '────────────────────────────────',
        'MCP Servers (1 server)',
        'Filter:',
        '→ pms_mcp - error',
        'Type to filter • Enter to select • Esc to close',
      ],
      cursorRow: 6,
      cursorCol: 2,
    }))
    expect(mirror.input).toBe('')
    expect(mirror.below.map(row => row.text)).toEqual([
      'MCP Servers (1 server)',
      'Filter:',
      '→ pms_mcp - error',
      'Type to filter • Enter to select • Esc to close',
    ])
  })

  it('never treats described slash option rows as the input bar', () => {
    const mirror = extractPromptMirror(snap({
      lines: [
        '  → /model',
        '   → /model [filter]           Select model',
        '     /ask                      Toggle ask',
      ],
      cursorRow: 0,
      cursorCol: 10,
    }))
    expect(mirror.input).toBe('/model')
    expect(mirror.below).toHaveLength(2)
  })

  it('keeps a partial /m draft while the highlighted /mcp option sits below', () => {
    // Ink paints `/mcp [subcommand] [iden…` with a truncated second bracket; that
    // row must stay an option, not steal the bar from the `/m` draft.
    const mirror = extractPromptMirror(snap({
      lines: [
        '→ /m',
        '→ /mcp [subcommand] [iden… Manage MCP servers (list, list-tools)',
        '   /model [filter]           Select model (Tab to edit)',
        '   /max-mode                 Toggle max mode',
        '↓ more below',
      ],
      reverseRows: [false, true, false, false, false],
      accentRows: [false, true, false, false, false],
      cursorRow: 1,
      cursorCol: 2,
    }))
    expect(mirror.input).toBe('/m')
    expect(mirror.below[0]?.text).toContain('/mcp')
    expect(mirror.below[0]?.highlighted).toBe(true)
    expect(mirror.below.some(row => row.text.includes('/model'))).toBe(true)
  })

  it('treats slash rows with (), [], or <> after the command as options', () => {
    const mirror = extractPromptMirror(snap({
      lines: [
        '→ /a',
        '→ /ask (Q&A, read-only; no edits)',
        '   /model [filter] Select model',
        '   /load-workspace <name> Load a saved workspace',
      ],
      reverseRows: [false, true, false, false],
      cursorRow: 1,
      cursorCol: 2,
    }))
    expect(mirror.input).toBe('/a')
    expect(mirror.below.map(row => row.text)).toEqual([
      '→ /ask (Q&A, read-only; no edits)',
      '   /model [filter] Select model',
      '   /load-workspace <name> Load a saved workspace',
    ])
  })

  it('prefers the light-gray painted row over a reverse-highlighted option', () => {
    const mirror = extractPromptMirror(snap({
      lines: [
        '→ /model',
        '  Composer 2.5 Fast',
        '→ Kimi K2.7 Code',
        '  GLM 5.2 High',
        'Type to filter • Enter to select • Tab to edit',
      ],
      reverseRows: [false, false, true, false, false],
      barBgRows: [true, false, false, false, false],
      cursorRow: 2,
      cursorCol: 2,
    }))
    expect(mirror.input).toBe('/model')
    expect(mirror.below[1]?.highlighted).toBe(true)
  })

  it('does not fill the input from an arrow-marked option while the picker is open', () => {
    const mirror = extractPromptMirror(snap({
      lines: [
        '→ /model',
        '→ Kimi K2.7 Code',
        '  GLM 5.2 High',
        'Type to filter • Enter to select • Tab to edit',
      ],
      barBgRows: [true, false, false, false],
      cursorRow: 1,
      cursorCol: 2,
    }))
    expect(mirror.input).toBe('/model')
    expect(mirror.below[0]?.text).toContain('Kimi K2.7 Code')
  })

  it('mirrors a full-screen picker body when option labels have no input bar', () => {
    const mirror = extractPromptMirror(snap({
      lines: [
        '→ first option',
        '  second option',
        'Type to filter • Enter to select • Tab to edit',
      ],
      reverseRows: [true, false, false],
      cursorRow: 0,
      cursorCol: 2,
    }))
    expect(mirror.input).toBe('')
    expect(mirror.below.map(row => row.text)).toEqual([
      '→ first option',
      '  second option',
      'Type to filter • Enter to select • Tab to edit',
    ])
    expect(mirror.below[0]?.highlighted).toBe(true)
  })

  it('mirrors a command pager that has no Filter field and no input bar', () => {
    const mirror = extractPromptMirror(snap({
      lines: [
        '  Cursor Agent',
        '  v2026.08.25-3e8eec8',
        '────────────────────────────────',
        ' Commands (0 commands)',
        '  → + Create new command',
        ' ↑/↓ to navigate • Enter to select • Esc to close',
      ],
      cursorRow: 4,
      cursorCol: 2,
    }))
    expect(mirror.input).toBe('')
    expect(mirror.below.some(row => row.text.includes('Create new command'))).toBe(true)
    expect(mirror.below.some(row => /Cursor Agent/u.test(row.text))).toBe(false)
  })

  it('treats the idle home tip as the input-bar row with an empty draft', () => {
    const mirror = extractPromptMirror(snap({
      lines: [
        '  Tip: hello',
        '  → Plan, search, build anything',
        '  Available models Max mode: OFF',
      ],
      barBgRows: [false, true, false],
      cursorRow: 1,
      cursorCol: 4,
    }))
    expect(mirror.input).toBe('')
    // Idle status under the tip is not an option surface.
    expect(mirror.below).toEqual([])
    expect(isCliStatusChrome('Plan, search, build anything')).toBe(true)
  })

  it('drops idle model/cwd chrome under a chat draft so Enter can arm a turn', () => {
    const mirror = extractPromptMirror(snap({
      lines: [
        '→ hello world',
        '  Auto',
        '  D:\\work',
      ],
      barBgRows: [true, false, false],
      cursorRow: 0,
      cursorCol: 4,
    }))
    expect(mirror.input).toBe('hello world')
    expect(mirror.below).toEqual([])
  })

  it('clears approval and composing chrome from the mirrored draft', () => {
    const approval = extractPromptMirror(snap({
      lines: [
        '你知道现在是什么情况么',
        '  Composing → Add a follow-up ctrl+c to stop',
        'Composer 2.5 Fast D:\\work · master',
        '←/→ to switch approval',
      ],
      barBgRows: [false, false, false, true],
      cursorRow: 3,
      cursorCol: 2,
    }))
    expect(approval.input).toBe('')
    expect(approval.below).toEqual([])

    const composingBar = extractPromptMirror(snap({
      lines: [
        '→ Composing → Add a follow-up ctrl+c to stop',
      ],
      barBgRows: [true],
      cursorRow: 0,
      cursorCol: 2,
    }))
    expect(composingBar.input).toBe('')
  })

  it('treats Working spinner rows as turn chrome', () => {
    expect(isCliTurnChrome('∴ Working Auto v2026.08.25-3e8eec8')).toBe(true)
    expect(isCliTurnChrome('∵ Working Autov2026.08.25-3e8eec8')).toBe(true)
    expect(isCliStatusChrome('∴ Working Auto v2026.08.25-3e8eec8')).toBe(true)
    // Version / model footers linger after the turn — status only, not busy pins.
    expect(isCliTurnChrome('v2026.08.25-3e8eec8')).toBe(false)
    expect(isCliStatusChrome('v2026.08.25-3e8eec8')).toBe(true)
    expect(isCliTurnChrome('Auto v2026.08.25-3e8eec8')).toBe(false)
    expect(isCliStatusChrome('Auto v2026.08.25-3e8eec8')).toBe(true)
    // Idle follow-up tips must not keep the overlay in running.
    expect(isCliTurnChrome('Add a follow-up')).toBe(false)
    expect(isCliStatusChrome('Add a follow-up')).toBe(true)
    expect(isCliTurnChrome('Composing → Add a follow-up ctrl+c to stop')).toBe(true)
  })

  it('does not treat abort banners as a composer draft or option surface', () => {
    expect(isCliStatusChrome('Error: [aborted] read ECONNRESET')).toBe(true)
    expect(isCliTurnChrome('Error: [aborted] read ECONNRESET')).toBe(false)
    expect(extractPromptMirror(snap({
      lines: ['→ Error: [aborted] read ECONNRESET'],
      barBgRows: [true],
      cursorRow: 0,
    }))).toEqual({ input: '', below: [] })
    expect(extractPromptMirror(snap({
      lines: ['→', '  Error: [aborted] read ECONNRESET'],
      barBgRows: [true, false],
      accentRows: [false, true],
      cursorRow: 0,
    }))).toEqual({ input: '', below: [] })
  })

  it('does not treat version footers as live-turn chrome', () => {
    expect(isCliTurnChrome('Working Autov2026.08.25-3e8eec8')).toBe(true)
    expect(isCliTurnChrome('  v2026.08.25-3e8eec8')).toBe(false)
  })

  it('treats model context-meter rows as status chrome', () => {
    expect(isCliStatusChrome('Auto · 9.3%')).toBe(true)
    expect(isCliStatusChrome('Auto · 9.3% Auto · 9.3%')).toBe(true)
    expect(isCliStatusChrome('Composer 2.5 Fast · 12%')).toBe(true)
    expect(isCliStatusChrome('Composer 2.5 Fast D:\\work · master')).toBe(true)
    expect(isCliTurnChrome('Auto · 9.3%')).toBe(false)
    expect(isCliStatusChrome('Auto')).toBe(true)
    // Bare model titles are /model options — not status chrome by themselves.
    expect(isCliStatusChrome('Composer 2.5 Fast')).toBe(false)
    expect(isCliStatusChrome('Cursor Grok 4.5 High Fast')).toBe(false)
    expect(extractPromptMirror(snap({
      lines: ['→ Auto'],
      barBgRows: [true],
      cursorRow: 0,
      cursorCol: 2,
    })).input).toBe('')
  })

  it('keeps the full model list when a bare model title is highlighted', () => {
    // No barBg paint: text matching must not treat `→ Composer 2.5 Fast` as the
    // empty input bar (regression: list truncated from the selection downward).
    const composer = extractPromptMirror(snap({
      lines: [
        '→ 跟进 Cursor',
        'Available models Max mode:OFF',
        'Filter:',
        '  Auto',
        '  Cursor Grok 4.6 High Fast',
        '→ Composer 2.5 Fast',
        '  Gemini 3.8 Flash High',
        '  Cursor Grok 4.5 High Fast',
        '  Kimi K3 Max',
        'Type to filter • Enter to select • Tab to edit',
      ],
      cursorRow: 5,
      cursorCol: 2,
    }))
    expect(composer.below.map(row => row.text).join('\n')).toContain('Available models')
    expect(composer.below.some(row => row.text.includes('Auto'))).toBe(true)
    expect(composer.below.some(row => /Composer 2\.5 Fast/u.test(row.text))).toBe(true)
    expect(composer.below.some(row => /Kimi K3 Max/u.test(row.text))).toBe(true)

    // Same class of bug for the bare `Auto` chip (still status chrome, but must
    // not win the bottom-up empty-bar scan while the picker is open).
    const auto = extractPromptMirror(snap({
      lines: [
        '→ ',
        'Available models',
        '→ Auto',
        '  Composer 2.5 Fast',
        'Type to filter • Enter to select',
      ],
      cursorRow: 2,
      cursorCol: 2,
    }))
    expect(auto.below.some(row => row.text.includes('Available models'))).toBe(true)
    expect(auto.below.some(row => /Composer 2\.5 Fast/u.test(row.text))).toBe(true)
  })

  it('does not treat a gray-painted Composer option as the input bar', () => {
    // Live failure mode: Ink paints the selected Composer row with the same
    // elevated gray as the composer, without reverse/accent — barBg must not
    // relocate the prompt row into the list (truncates everything above).
    const stolenBar = extractPromptMirror(snap({
      lines: [
        '→ 跟进 Cursor',
        'Available models Max mode:OFF',
        'Filter:',
        '  Auto',
        '  Cursor Grok 4.6 High Fast',
        '→ Composer 2.5 Fast',
        '  Gemini 3.8 Flash High',
        '  Cursor Grok 4.5 High Fast',
        'Type to filter • Enter to select • Tab to edit',
      ],
      barBgRows: [false, false, false, false, false, true, false, false, false],
      cursorRow: 5,
      cursorCol: 2,
    }))
    expect(stolenBar.below.some(row => row.text.includes('Available models'))).toBe(true)
    expect(stolenBar.below.some(row => /Composer 2\.5 Fast/u.test(row.text))).toBe(true)
    expect(stolenBar.below.some(row => /Cursor Grok 4\.5 High Fast/u.test(row.text))).toBe(true)

    // Consecutive gray washes from the real bar through the list must stop at
    // the option panel — otherwise below starts at the selection.
    const swallowed = extractPromptMirror(snap({
      lines: [
        '→ 跟进 Cursor',
        'Available models',
        'Filter:',
        '  Auto',
        '→ Composer 2.5 Fast',
        '  Cursor Grok 4.5 High Fast',
        'Type to filter • Enter to select',
      ],
      barBgRows: [true, true, true, true, true, false, false],
      accentRows: [false, false, false, false, true, false, false],
      cursorRow: 4,
      cursorCol: 2,
    }))
    expect(swallowed.input).toBe('跟进 Cursor')
    expect(swallowed.below[0]?.text).toContain('Available models')
    expect(swallowed.below.some(row => /Composer 2\.5 Fast/u.test(row.text))).toBe(true)
  })

  it('does not steal the gray bar when the cursor sits on a colored option', () => {
    const mirror = extractPromptMirror(snap({
      lines: [
        '→ /model',
        'Available models',
        '→ Kimi K2.7 Code',
        '  GLM 5.2 High',
        'Type to filter • Enter to select • Tab to edit',
      ],
      reverseRows: [false, false, false, false, false],
      accentRows: [false, false, true, false, false],
      barBgRows: [true, false, false, false, false],
      cursorRow: 2,
      cursorCol: 2,
    }))
    expect(mirror.input).toBe('/model')
    expect(mirror.below[1]?.highlighted).toBe(true)
    expect(mirror.below[1]?.text).toContain('Kimi K2.7 Code')
  })

  it('prefers a slash draft over the home tip while a picker footer is on screen', () => {
    const mirror = extractPromptMirror(snap({
      lines: [
        '→ Plan, search, build anything',
        '→ /ask',
        '→ /ask                      Toggle ask',
        '   /plan                     Switch to plan',
        'Type to filter • Enter to select',
      ],
      cursorRow: 2,
      cursorCol: 2,
    }))
    expect(mirror.input).toBe('/ask')
    expect(mirror.below.some(row => row.text.includes('Toggle ask'))).toBe(true)
    expect(mirror.below.some(row => /Plan,\s*search/u.test(row.text))).toBe(false)
  })

  it.each([
    {
      name: 'slash menu',
      lines: [
        '→ /',
        '   → /ask                      Toggle ask',
        '     /plan                     Switch to plan',
        'Type to filter • Enter to select',
      ],
      cursorRow: 1,
      input: '/',
      below: ['Toggle ask', 'Switch to plan'],
    },
    {
      name: 'trust keys',
      lines: [
        '→ Plan, search, build anything',
        '[y] Yes, I trust this folder',
        '[n] No, exit',
      ],
      cursorRow: 1,
      input: '',
      below: ['Yes, I trust this folder', 'No, exit'],
    },
    {
      name: 'filtered list',
      lines: [
        '→ Plan, search, build anything',
        'Filter:',
        '→  first option',
        '   second option             Fast',
        'Type to filter • Enter to select • Tab to edit',
      ],
      cursorRow: 2,
      input: '',
      below: ['Filter:', 'first option', 'second option'],
    },
    {
      name: 'ask-question',
      lines: [
        '→ ',
        'Which file?',
        '→ src/a.ts',
        '  src/b.ts',
        'Press Enter to submit, Escape to cancel',
      ],
      cursorRow: 2,
      input: '',
      below: ['Which file?', 'src/a.ts', 'src/b.ts'],
    },
    {
      name: 'key-shown approval',
      lines: [
        '→ ',
        '[y] Approve this MCP',
        '[n] Reject',
        'Enter to select, or press the key shown',
      ],
      cursorRow: 1,
      input: '',
      below: ['Approve this MCP', 'Reject', 'press the key shown'],
    },
  ])('keeps the $name picker under the input bar when paint is missing', ({
    lines,
    cursorRow,
    input,
    below,
  }) => {
    const mirror = extractPromptMirror(snap({
      lines,
      cursorRow,
      cursorCol: 2,
    }))
    expect(mirror.input).toBe(input)
    for (const snippet of below) {
      expect(mirror.below.some(row => row.text.includes(snippet))).toBe(true)
    }
  })

  it('keeps wrapped gray-bar rows out of the below-prompt list', () => {
    const mirror = extractPromptMirror(snap({
      lines: [
        '→ hello',
        '  world',
        'Type to filter',
      ],
      barBgRows: [true, true, false],
      cursorRow: 0,
    }))
    expect(mirror.input).toBe('hello')
    expect(mirror.below.map(row => row.text)).toEqual(['Type to filter'])
  })

  it('keeps an internal blank row and drops trailing empty PTY rows', () => {
    const mirror = extractPromptMirror(snap({
      lines: [
        '→ /',
        '→ /model [filter]           Select model',
        '',
        '   /ask                      Toggle ask',
        '',
        '',
      ],
      barBgRows: [true, false, false, false, false, false],
      cursorRow: 0,
    }))
    expect(mirror.below.map(row => row.text)).toEqual([
      '→ /model [filter]           Select model',
      '',
      '   /ask                      Toggle ask',
    ])
  })

  it('typed draft outranks a leftover home tip slogan', () => {
    const mirror = extractPromptMirror(snap({
      lines: [
        '  → Plan, search, build anything',
        '  → hello world',
      ],
      barBgRows: [false, true],
      cursorRow: 0,
      cursorCol: 4,
    }))
    expect(mirror.input).toBe('hello world')
  })

  it('prefers a typed slash draft over the home tip when both are on screen', () => {
    const mirror = extractPromptMirror(snap({
      lines: [
        '  → Plan, search, build anything',
        '  → /',
      ],
      barBgRows: [false, true],
      cursorRow: 1,
      cursorCol: 4,
    }))
    expect(mirror.input).toBe('/')
    expect(mirror.below).toEqual([])
  })
})

describe('encodeBrowserKey', () => {
  it('maps arrows, enter, and printable characters', () => {
    expect(encodeBrowserKey('ArrowDown', {})).toBe('\x1b[B')
    expect(encodeBrowserKey('ArrowUp', {})).toBe('\x1b[A')
    expect(encodeBrowserKey('ArrowRight', {})).toBe('\x1b[C')
    expect(encodeBrowserKey('ArrowLeft', {})).toBe('\x1b[D')
    expect(encodeBrowserKey('Enter', {})).toBe('\r')
    expect(encodeBrowserKey('Escape', {})).toBe('\x1b')
    expect(encodeBrowserKey('Backspace', {})).toBe('\x7f')
    expect(encodeBrowserKey('Tab', {})).toBe('\t')
    expect(encodeBrowserKey('Delete', {})).toBe('\x1b[3~')
    expect(encodeBrowserKey('Home', {})).toBe('\x1b[H')
    expect(encodeBrowserKey('End', {})).toBe('\x1b[F')
    expect(encodeBrowserKey('/', {})).toBe('/')
    expect(encodeBrowserKey('Enter', { ctrl: true })).toBeUndefined()
    expect(encodeBrowserKey('a', { ctrl: true })).toBe('\x01')
    expect(encodeBrowserKey('e', { ctrl: true })).toBe('\x05')
    expect(encodeBrowserKey('u', { ctrl: true })).toBe('\x15')
    expect(encodeBrowserKey('w', { ctrl: true })).toBe('\x17')
    expect(encodeBrowserKey('C', { ctrl: true })).toBe('\x03')
    expect(encodeBrowserKey('U', { ctrl: true })).toBe('\x15')
    expect(encodeBrowserKey('A', { ctrl: true })).toBe('\x01')
    expect(encodeBrowserKey('E', { ctrl: true })).toBe('\x05')
    expect(encodeBrowserKey('W', { ctrl: true })).toBe('\x17')
    expect(encodeBrowserKey('c', { meta: true })).toBeUndefined()
    expect(encodeBrowserKey('c', { alt: true })).toBeUndefined()
    expect(encodeBrowserKey('F1', {})).toBeUndefined()
  })
})

describe('findPromptRow', () => {
  it('skips gray option rows and locates the slash bar without a barBg array', () => {
    expect(findPromptRow(['  → /'], 0)).toBe(0)
    const skipped = extractPromptMirror(snap({
      lines: [
        '/ask                      Toggle ask',
        '[y] Yes trust this folder',
        '→ /',
      ],
      barBgRows: [true, true, true],
      cursorRow: 0,
    }))
    expect(skipped.input).toBe('/')
    expect(skipped.below).toEqual([])
    expect(extractPromptMirror(snap({
      lines: ['→ Selected          desc'],
      reverseRows: [true],
      cursorRow: 0,
    }))).toEqual({ input: '', below: [] })
    expect(extractPromptMirror(snap({
      lines: ['/model'],
      cursorRow: 0,
    })).input).toBe('/model')
    expect(findPromptRow(['→ /'])).toBe(0)
    expect(extractPromptMirror(snap({
      lines: ['→ picked', '→ /'],
      reverseRows: [true, false],
      barBgRows: [true, true],
      cursorRow: 0,
    })).input).toBe('/')
    expect(extractPromptMirror(snap({
      lines: ['→ picked', '→ /'],
      accentRows: [true, false],
      barBgRows: [true, true],
      cursorRow: 0,
    })).input).toBe('/')
    expect(extractPromptMirror(snap({
      lines: ['[y] Yes trust'],
      cursorRow: 0,
    }))).toEqual({
      input: '',
      below: [{ text: '[y] Yes trust', highlighted: false }],
    })
    expect(extractPromptMirror(snap({
      lines: ['→ foo          bar'],
      cursorRow: 0,
    }))).toEqual({ input: '', below: [] })
    expect(isCliPickerChrome('Type to filter • Enter to select')).toBe(true)
    expect(isCliPickerChrome('[y] Yes, I trust this folder')).toBe(true)
    expect(isCliPickerChrome('Filter:')).toBe(true)
    expect(isCliPickerChrome('Press Enter to submit, Escape to cancel')).toBe(true)
    expect(isCliPickerChrome('Hello from the assistant')).toBe(false)
    const hole = new Array<string>(2)
    hole[0] = '→ /'
    expect(extractPromptMirror({
      lines: hole,
      reverseRows: [false, false],
      barBgRows: [true, false],
      lightBgRows: [true, false],
      accentRows: [false, false],
      cursorRow: 0,
      cursorCol: 0,
    }).input).toBe('/')
    const missingBarText = new Array<string>(1)
    expect(extractPromptMirror({
      lines: missingBarText,
      reverseRows: [false],
      barBgRows: [true],
      lightBgRows: [true],
      accentRows: [false],
      cursorRow: 0,
      cursorCol: 0,
    }).input).toBe('')
    expect(findPromptRow(['→ /', 'x'], 5, [false, false])).toBe(0)
    const alias = snap({
      lines: ['→ hello', '  world', 'Type to filter'],
      lightBgRows: [true, true, false],
      cursorRow: 0,
    })
    const wrapped = extractPromptMirror({
      ...alias,
      barBgRows: undefined as unknown as boolean[],
    })
    expect(wrapped.input).toBe('hello')
    expect(wrapped.below.map(row => row.text)).toEqual(['Type to filter'])
  })
})

describe('extractAskQuestionMirror', () => {
  const V = '\u2502'
  const H = '\u2500'
  const TL = '\u256D'
  const TR = '\u256E'
  const BL = '\u2570'
  const BR = '\u256F'
  const UP = '\u2191'

  it('projects a boxed AskQuestion panel and skips the frame', () => {
    const top = `${TL}${H.repeat(12)}${TR}`
    const bottom = `${BL}${H.repeat(12)}${BR}`
    const mirror = extractAskQuestionMirror(snap({
      lines: [
        'you picked another multi-select',
        '   ',
        top,
        `${V} AskQuestion demo`,
        `${V} Question 1 of 1`,
        `${V} 1. dinner tonight?`,
        `${V} > [ ] hotpot`,
        `${V}   [ ] noodles`,
        `${V}tight sides${V}`,
        `  ${V} padded side`,
        `${V} ${UP}/\\ option · Space select · Esc to skip`,
        bottom,
        'Auto · 1%',
      ],
      cursorRow: 5,
    }))
    expect(mirror).toEqual({
      input: '',
      below: [
        { text: 'AskQuestion demo', highlighted: false },
        { text: 'Question 1 of 1', highlighted: false },
        { text: '1. dinner tonight?', highlighted: false },
        { text: '> [ ] hotpot', highlighted: true },
        { text: '  [ ] noodles', highlighted: false },
        { text: 'tight sides', highlighted: false },
        { text: 'padded side', highlighted: false },
        { text: `${UP}/\\ option · Space select · Esc to skip`, highlighted: false },
      ],
    })
  })

  it('projects an unboxed AskQuestion panel and ignores chat above it', () => {
    const mirror = extractAskQuestionMirror(snap({
      lines: [
        'you chose average',
        'AskQuestion multi-select',
        'Question 1 of 1',
        '1. what to eat?',
        '> [ ] hotpot',
        '  [x] fruit',
        'Space select · Enter next/submit',
        'later chat',
      ],
      accentRows: [false, false, false, false, false, true, false, false],
      cursorRow: 5,
    }))
    expect(mirror?.input).toBe('')
    expect(mirror?.below.map(row => row.text)).toEqual([
      'AskQuestion multi-select',
      'Question 1 of 1',
      '1. what to eat?',
      '> [ ] hotpot',
      '  [x] fruit',
      'Space select · Enter next/submit',
    ])
    expect(mirror?.below[3]?.highlighted).toBe(true)
    expect(mirror?.below[4]?.highlighted).toBe(true)
  })

  it('returns undefined for a bare AskQuestion mention', () => {
    expect(extractAskQuestionMirror(snap({
      lines: [
        'The AskQuestion skill shows a box',
        '1. this is just a list',
        'hello',
      ],
      cursorRow: 0,
    }))).toBeUndefined()
    expect(isAskQuestionChrome('hello')).toBe(false)
    expect(isAskQuestionChrome('AskQuestion demo')).toBe(true)
    expect(isAskQuestionChrome('Question 2 of 4')).toBe(true)
    expect(isAskQuestionChrome('  [ ] apples')).toBe(true)
    expect(isAskQuestionChrome(`${UP} option only`)).toBe(true)
  })

  it('marks reverse-video and caret checkbox rows as highlighted', () => {
    const mirror = extractAskQuestionMirror(snap({
      lines: [
        'AskQuestion caret',
        'Question 1 of 1',
        '  [ ] first',
        '  [ ] second',
        'Esc to skip',
      ],
      reverseRows: [false, false, true, false, false],
      cursorRow: 3,
    }))
    expect(mirror?.below[2]?.highlighted).toBe(true)
    expect(mirror?.below[3]?.highlighted).toBe(true)
  })

  it('keeps the last AskQuestion box when two are on screen', () => {
    const mirror = extractAskQuestionMirror(snap({
      lines: [
        'AskQuestion old',
        'Question 1 of 2',
        '[x] done',
        'AskQuestion new',
        'Question 2 of 2',
        '> [ ] next',
        'Space select',
      ],
      cursorRow: 5,
    }))
    expect(mirror?.below[0]?.text).toBe('AskQuestion new')
    expect(mirror?.below.some(row => row.text.includes('done'))).toBe(false)
  })

  it('lets AskQuestion win over a concurrent slash menu', () => {
    const mirror = extractPromptMirror(snap({
      lines: [
        '→ /m',
        '→ /model [filter]           Select model',
        'AskQuestion demo',
        'Question 1 of 1',
        '> [ ] hotpot',
        'Space select',
      ],
      barBgRows: [true, false, false, false, false, false],
      cursorRow: 1,
    }))
    expect(mirror.input).toBe('')
    expect(mirror.below.map(row => row.text)).toEqual([
      'AskQuestion demo',
      'Question 1 of 1',
      '> [ ] hotpot',
      'Space select',
    ])
  })

  it('trims blank padding and still reads a holey screen row', () => {
    const lines = new Array<string>(6)
    lines[0] = 'AskQuestion holes'
    lines[1] = 'Question 1 of 1'
    lines[3] = '> [ ] a'
    const mirror = extractAskQuestionMirror(snap({
      lines: lines as string[],
      cursorRow: 3,
    }))
    expect(mirror?.below.map(row => row.text)).toEqual([
      'AskQuestion holes',
      'Question 1 of 1',
      '',
      '> [ ] a',
    ])
  })

  it('covers boxed walk-up holes, frame-only body, and the 48-row cap', () => {
    const H = '\u2500'
    const V = '\u2502'
    const walk = new Array<string>(5)
    walk[2] = 'AskQuestion leftover'
    walk[3] = H.repeat(16)
    walk[4] = 'Enter next/submit'
    const leftover = extractAskQuestionMirror(snap({
      lines: walk as string[],
      cursorRow: 2,
    }))
    expect(leftover?.below.map(row => row.text)).toEqual([
      'AskQuestion leftover',
      'Enter next/submit',
    ])

    const padded = extractAskQuestionMirror(snap({
      lines: [
        'AskQuestion pad',
        'Question 1 of 1   ',
        `  ${V}padded`,
        `${V}hello ${V}`,
        '> [ ] a',
        '',
        'later chat',
      ],
      cursorRow: 4,
    }))
    expect(padded?.below.map(row => row.text)).toEqual([
      'AskQuestion pad',
      'Question 1 of 1',
      'padded',
      'hello',
      '> [ ] a',
    ])

    const lines = new Array<string>(51)
    lines[0] = 'AskQuestion cap'
    lines[1] = 'Question 1 of 1'
    lines[49] = H.repeat(8)
    const capped = extractAskQuestionMirror(snap({
      lines: lines as string[],
      cursorRow: 0,
    }))
    expect(capped?.below.some(row => row.text.includes('Question 1 of 1'))).toBe(true)

    const holeyEnd = new Array<string>(51)
    holeyEnd[0] = 'AskQuestion cap2'
    holeyEnd[1] = 'Question 1 of 1'
    expect(extractAskQuestionMirror(snap({
      lines: holeyEnd as string[],
      cursorRow: 0,
    }))?.below[0]?.text).toBe('AskQuestion cap2')
  })
})
