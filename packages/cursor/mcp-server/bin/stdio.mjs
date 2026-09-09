/**
 * Stdio entry for Cursor MCP.
 *
 * Cursor may spawn this process with a non-workspace cwd. Resolving
 * `--import tsx/esm` from that cwd fails (no local `node_modules`), so the
 * IDE never mounts `dsh` into the agent tool catalog. This file re-execs Node
 * with an absolute `tsx/esm` import and `cwd` set to the repo root, then
 * boots `dsh --profile cursor-mcp` with inherited stdio for MCP JSON-RPC.
 *
 * Keep stdout quiet on the success path — no logging here.
 */

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..')
const require = createRequire(join(repoRoot, 'package.json'))
const tsxEsm = pathToFileURL(require.resolve('tsx/esm')).href
const bin = join(repoRoot, 'apps/cli/src/bin.ts')

const child = spawn(
  process.execPath,
  ['--import', tsxEsm, bin, '--profile', 'cursor-mcp', ...process.argv.slice(2)],
  {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  },
)

child.on('error', (error) => {
  process.stderr.write(`cursor-mcp-server: ${String(error)}\n`)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
