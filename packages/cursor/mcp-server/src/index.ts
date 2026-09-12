/**
 * Cursor-facing MCP server plugin: stdio JSON-RPC, filtered `dsh_*` tools,
 * and `dsh_system_prompt` / initialize instructions from mcp-prompt.
 *
 * Namespace plugin (named exports, no default export). Stdio profile: stdout is
 * MCP JSON-RPC. Web Host: Streamable HTTP on `/cursor-mcp`.
 *
 * @module @deepseek-ai/dsh-cursor-mcp-server
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
// Empty type import carries the loader Context merge for the settlement await.
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { createOwnerAgent } from './owner.ts'
import {
  connectHttpMcp,
  isWebServerLike,
} from './http.ts'
import { connectMcpServer } from './server.ts'

export {
  isOmittedMcpToolName,
  listMcpTools,
  SYSTEM_PROMPT_TOOL_DESCRIPTION,
  SYSTEM_PROMPT_TOOL_NAME,
  toMcpInputSchema,
} from './catalog.ts'
export {
  contentBlockToMcpText,
  executeMcpCall,
  jsonToolArguments,
  mapToolResult,
} from './execute.ts'
export { createOwnerAgent } from './owner.ts'
export { connectMcpServer, MCP_SERVER_NAME } from './server.ts'
export {
  CURSOR_DSH_MCP_URL_ENV,
  CURSOR_MCP_HTTP_PATH,
  cursorMcpAttachUrl,
  isLoopbackMcpRequest,
  isWebServerLike,
} from './http.ts'
export { resolveMcpSkillCatalog } from './skill-catalog.ts'
export type { ConnectMcpServerOptions, McpServerSession } from './server.ts'
export type { McpCallInput } from './execute.ts'

const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url))

/** Version advertised in MCP `initialize.serverInfo`. */
export const MCP_SERVER_VERSION: string = (
  JSON.parse(readFileSync(join(PACKAGE_DIR, '../package.json'), 'utf8')) as { version: string }
).version

/** Stable Cordis plugin name. */
export const name = 'cursor-mcp-server'

/** Tool registry plus Agent factory (extra-tool execute uses `exec.agent`). */
export const inject = ['tools', 'agents']

/** Plugin config: workspace cwd for the MCP-owned Agent. */
export interface Config {
  /** Absolute workspace cwd. Empty uses `process.cwd()`. */
  cwd: string
}

export const Config: z<Config> = z.object({
  cwd: z.string().default(''),
})

/**
 * Transport factory. Production uses process stdio; tests replace this with InMemory.
 * Connecting the default factory claims `process.stdin` / `process.stdout`.
 */
export const internals: { createTransport(): Transport } = {
  createTransport: () => new StdioServerTransport(),
}

/**
 * Create the owner Agent and connect the MCP transport on this fiber.
 * @param ctx - plugin context carrying `tools` and `agents`.
 * @param config - validated cwd config.
 * @returns after the MCP transport is connected.
 */
async function connectOwner(ctx: Context, config: Config): Promise<void> {
  const web = ctx.get('webServer')
  if (isWebServerLike(web)) {
    await connectHttpMcp(ctx, web, config, MCP_SERVER_VERSION)
    return
  }
  const handle = await createOwnerAgent(ctx, config)
  try {
    const session = await connectMcpServer(ctx, {
      transport: internals.createTransport(),
      agent: handle.agent,
      version: MCP_SERVER_VERSION,
    })
    ctx.effect(() => () => {
      void session.close()
      void handle.dispose()
    }, 'cursor-mcp-server')
  } catch (error) {
    await handle.dispose()
    throw error
  }
}

/**
 * Schedule the owner Agent and MCP connect. This entry remains explicitly
 * `async`: Cordis treats a prototype-bearing ordinary function as a constructor.
 *
 * When a Loader is present, `apply` returns before settlement — awaiting
 * `loader.await()` from inside this fiber's activation deadlocks the tree.
 * Hand-built tests have no Loader, so this function awaits connect itself.
 * @param ctx - plugin context carrying `tools` and `agents`.
 * @param config - validated cwd config.
 * @returns after connect when there is no Loader; immediately when there is one.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const loader = ctx.get('loader')
  const settled = loader?.await() ?? Promise.resolve()
  const run = (): Promise<void> => settled.then(() => connectOwner(ctx, config))
  if (loader === undefined) {
    await run()
    return
  }
  void run().catch((error: unknown) => {
    process.stderr.write(`cursor-mcp-server: ${String(error)}\n`)
  })
}
