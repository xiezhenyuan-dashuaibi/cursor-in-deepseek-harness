/** Locate the official Cursor CLI entry the gateway should exec. */

import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Bundled zip root beside this package (`packages/cursor/cli`). */
export const BUNDLED_CLI_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../cli')

const VERSION_DIR = /^\d{4}\.\d{1,2}\.\d{1,2}(-\d{2}-\d{2}-\d{2})?-[a-f0-9]+$/

/** Program and arguments for one CLI spawn. */
export interface AgentArgv {
  /** Absolute executable path (`node.exe`, `agent.cmd`, or a configured binary). */
  readonly file: string
  /** Arguments after the program, including `index.js` when launching the bundled Node entry. */
  readonly args: readonly string[]
}

/**
 * Resolve the Cursor CLI program. A non-empty `command` wins; otherwise the
 * bundled `packages/cursor/cli` tree is used. Missing both fails loud: the
 * overlay cannot invent a second installer.
 * @param command - configured executable, or empty to use the bundled zip.
 * @param extraArgs - appended after the resolved program arguments.
 * @param cliRoot - bundled CLI directory; omitted uses {@link BUNDLED_CLI_ROOT}.
 * @returns the spawn argv.
 */
export function resolveAgentArgv(
  command: string,
  extraArgs: readonly string[] = [],
  cliRoot?: string,
): AgentArgv {
  if (command.length > 0) return { file: command, args: [...extraArgs] }
  const bundled = resolveBundledAgent(cliRoot ?? BUNDLED_CLI_ROOT)
  if (bundled === undefined) {
    throw new Error(
      'cursor-agent-gateway: no agentCommand configured and no bundled Cursor CLI at packages/cursor/cli',
    )
  }
  return { file: bundled.file, args: [...bundled.args, ...extraArgs] }
}

/**
 * Prefer the versioned `node.exe`/`index.js` pair (the official launcher's
 * last hop) so the child is the CLI itself, not cmd.exe wrapping PowerShell.
 * @param cliRoot - `packages/cursor/cli` or a test fixture with the same layout.
 * @returns spawn argv, or undefined when that tree has no usable entry.
 */
export function resolveBundledAgent(cliRoot: string): AgentArgv | undefined {
  const versionsRoot = join(cliRoot, 'versions')
  if (existsSync(versionsRoot)) {
    const versions = readdirSync(versionsRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && VERSION_DIR.test(entry.name))
      .map(entry => entry.name)
      .sort()
    const latest = versions.at(-1)
    if (latest !== undefined) {
      const dir = join(versionsRoot, latest)
      const indexJs = join(dir, 'index.js')
      if (existsSync(indexJs)) {
        const windowsNode = join(dir, 'node.exe')
        if (existsSync(windowsNode)) return { file: windowsNode, args: [indexJs] }
        return { file: process.execPath, args: [indexJs] }
      }
    }
  }
  const windowsCmd = join(cliRoot, 'agent.cmd')
  if (process.platform === 'win32' && existsSync(windowsCmd)) return { file: windowsCmd, args: [] }
  const posixAgent = join(cliRoot, 'agent')
  if (existsSync(posixAgent)) return { file: posixAgent, args: [] }
  return undefined
}
