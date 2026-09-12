/** Parse Cursor CLI MCP listing output for the project `dsh` server. */

import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { filterConfiguredAgentArgs } from './headless-argv.ts'

/** Wire value on `{op:"dsh_mcp"}` and `{op:"snapshot"}.dshMcp`. */
export type DshMcpWireStatus = 'checking' | 'connected' | 'disconnected'

/**
 * Definitive parse of listing text, or `unknown` when `dsh` has not spoken yet.
 */
export type DshMcpListClass = DshMcpWireStatus | 'unknown'

/** Drain result of one `mcp list-tools dsh` child. */
export type McpListDrain = {
  text: string
  timedOut: boolean
}

/** Wait past Cursor's ~30s initialize; settle early when `dsh` classifies. */
export const DSH_MCP_LIST_TIMEOUT_MS = 60_000

/** Re-check while `dsh` is down so a late stdio mount can flip the chrome. */
export const DSH_MCP_RETRY_DISCONNECTED_MS = 15_000

/** Re-check while `dsh` is up so a drop is visible without asking the model. */
export const DSH_MCP_RETRY_CONNECTED_MS = 60_000

/** Retry after a hang/timeout that never classified `dsh`. */
export const DSH_MCP_RETRY_TIMEOUT_MS = 1_000

/**
 * Argv after the program file for `mcp list-tools dsh`.
 * Trust flags stay; print flags are stripped so this is not a stream-json turn.
 * @param programArgs - argv from {@link resolveAgentArgv} / the overlay session.
 * @returns spawn args including `mcp` `list-tools` `dsh`.
 */
export function buildMcpListArgs(programArgs: readonly string[]): string[] {
  return [...filterConfiguredAgentArgs(programArgs), 'mcp', 'list-tools', 'dsh']
}

const DSH_ROW = /(?:^|\n)[^\S\n]*(?:→\s*)?dsh(?:_mcp)?[^\S\n]*[:\-—][^\S\n]*([^\n]*)/i

/**
 * Classify listing text for project `dsh` only. Ignores `pms_mcp` and peers.
 * @param text - combined stdout and stderr so far.
 * @returns `connected` / `disconnected` when `dsh` has a row or tool names;
 *   `unknown` when the listing is still incomplete.
 */
export function classifyDshMcpListOutput(text: string): DshMcpListClass {
  if (/\bdsh_skill\b/.test(text) || /\bmcp__dsh__/.test(text)) return 'connected'
  const match = DSH_ROW.exec(text)
  if (match === null) return 'unknown'
  const rest = (match[1] ?? '').trim().toLowerCase()
  if (rest.length === 0) return 'unknown'
  if (/\b(error|fail|failed|timeout|timed out|not connected|disconnected)\b/.test(rest)) {
    return 'disconnected'
  }
  if (/\bready\b/.test(rest) || rest === 'ok' || rest === 'connected') return 'connected'
  return 'unknown'
}

/**
 * True when listing text shows project `dsh` ready.
 * @param text - combined stdout and stderr.
 * @returns whether overlay chrome should show connected.
 */
export function dshMcpConnectedFromCliOutput(text: string): boolean {
  return classifyDshMcpListOutput(text) === 'connected'
}

/**
 * Map one child drain onto chrome status and the next retry delay.
 * A hang with no `dsh` row stays `checking` instead of settling `disconnected`.
 * @param drain - text plus whether the wait hit {@link DSH_MCP_LIST_TIMEOUT_MS}.
 * @returns status to publish and delay before the next probe.
 */
export function settleDshMcpProbe(drain: McpListDrain): {
  status: DshMcpWireStatus
  retryMs: number
} {
  const classified = classifyDshMcpListOutput(drain.text)
  if (classified === 'connected') {
    return { status: 'connected', retryMs: DSH_MCP_RETRY_CONNECTED_MS }
  }
  if (classified === 'disconnected') {
    return { status: 'disconnected', retryMs: DSH_MCP_RETRY_DISCONNECTED_MS }
  }
  if (drain.timedOut) {
    return { status: 'checking', retryMs: DSH_MCP_RETRY_TIMEOUT_MS }
  }
  return { status: 'disconnected', retryMs: DSH_MCP_RETRY_DISCONNECTED_MS }
}

/**
 * Drain stdout and stderr until the child classifies `dsh`, closes, or times out.
 * Settles as soon as {@link classifyDshMcpListOutput} is definitive so a hung
 * peer server cannot hold the chrome on `disconnected`.
 * @param child - spawned `mcp list-tools dsh` process.
 * @param timeoutMs - kill deadline.
 * @returns concatenated utf8 and whether the deadline fired first.
 */
export function readChildOutput(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<McpListDrain> {
  return new Promise((resolve) => {
    const chunks: string[] = []
    let settled = false
    let timedOut = false
    const finish = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ text: chunks.join(''), timedOut })
    }
    const stopChild = (): void => {
      try {
        child.kill()
      } catch {
        // Exit already in flight.
      }
    }
    const onChunk = (chunk: string): void => {
      chunks.push(chunk)
      const classified = classifyDshMcpListOutput(chunks.join(''))
      if (classified === 'connected' || classified === 'disconnected') {
        stopChild()
        finish()
      }
    }
    const timer = setTimeout(() => {
      timedOut = true
      stopChild()
      finish()
    }, timeoutMs)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', onChunk)
    child.stderr.on('data', onChunk)
    child.once('close', () => { finish() })
    child.once('error', () => { finish() })
  })
}
