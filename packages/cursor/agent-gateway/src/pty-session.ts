/* v8 ignore file -- @preserve */
/** Long-lived interactive Cursor CLI on a PTY for option-surface mapping. */

import { createRequire } from 'node:module'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import { applySpineFence } from './spine-fence.ts'

const require = createRequire(import.meta.url)

/** Minimal interactive terminal surface used by {@link attachAgentChat}. */
export type InteractivePty = {
  /** Write UTF-8 / CSI bytes to the child. */
  write: (data: string) => void
  /** Resize the child PTY. */
  resize: (cols: number, rows: number) => void
  /** Terminate the child. */
  kill: () => void
  /** Subscribe to stdout text. */
  onData: (listener: (data: string) => void) => void
  /** Subscribe to process exit. */
  onExit: (listener: (exitCode: number) => void) => void
}

/** Injectable PTY spawn so tests never launch a real Cursor CLI. */
export type SpawnInteractivePty = (
  file: string,
  args: readonly string[],
  options: {
    readonly cwd: string
    readonly env: NodeJS.ProcessEnv
    readonly cols: number
    readonly rows: number
  },
) => InteractivePty

/* v8 ignore start -- native node-pty; chat-session tests inject SpawnInteractivePty. */
/**
 * Spawn the bundled/interactive Cursor CLI under node-pty with the spine fence.
 * @param file - executable path (or `node` when args begin with index.js).
 * @param args - program argv after the executable.
 * @param options - cwd and terminal size.
 * @returns a live {@link InteractivePty}.
 */
export function spawnNodePtySession(
  file: string,
  args: readonly string[],
  options: {
    readonly cwd: string
    readonly env?: NodeJS.ProcessEnv
    readonly cols?: number
    readonly rows?: number
  },
): InteractivePty {
  const nodePty = require('node-pty') as typeof import('node-pty')
  const cols = options.cols ?? 100
  const rows = options.rows ?? 32
  const fenced = applySpineFence({
    file,
    args,
    cwd: options.cwd,
    env: { ...scrubbedParentEnv(), ...options.env },
  })
  const term = nodePty.spawn(fenced.file, [...fenced.args], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: options.cwd,
    env: fenced.env as Record<string, string>,
    useConpty: true,
  })
  const dataListeners = new Set<(data: string) => void>()
  const exitListeners = new Set<(code: number) => void>()
  term.onData((data: string) => {
    for (const listener of dataListeners) listener(data)
  })
  term.onExit(({ exitCode }: { exitCode: number }) => {
    for (const listener of exitListeners) listener(exitCode)
  })
  return {
    write(data) { term.write(data) },
    resize(nextCols, nextRows) { term.resize(nextCols, nextRows) },
    kill() {
      try {
        term.kill()
      } catch {
        // Exit races kill.
      }
    },
    onData(listener) { dataListeners.add(listener) },
    onExit(listener) { exitListeners.add(listener) },
  }
}
/* v8 ignore stop */
