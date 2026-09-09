/**
 * Low-level MCP `Server`: dynamic `tools/list`, `tools/call`, and `listChanged`.
 * McpServer.registerTool is a static catalog; this file needs live `ctx.tools.schemas()`.
 */

/* oxlint-disable typescript/no-deprecated -- low-level Server for a dynamic tool list */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { renderMcpSystemPrompt } from '@deepseek-ai/dsh-cursor-mcp-prompt'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { listMcpTools } from './catalog.ts'
import { executeMcpCall } from './execute.ts'
import { resolveMcpSkillCatalog } from './skill-catalog.ts'

/** MCP `initialize.serverInfo.name` — Cursor prefixes tools with this (`mcp__dsh__…`). */
export const MCP_SERVER_NAME = 'dsh'

/** Connected MCP session; `close` stops notifications and the transport. */
export interface McpServerSession {
  /** MCP SDK server (tests may spy on `sendToolListChanged`). */
  readonly server: Server
  /**
   * Drop the `tools/change` listener and close the MCP server.
   * @returns after the transport has closed.
   */
  close(): Promise<void>
}

/** Options for {@link connectMcpServer}. */
export interface ConnectMcpServerOptions {
  /** Stdio in production; InMemory in tests. */
  transport: Transport
  /** Owner Agent passed to every `ctx.tools.execute`. */
  agent?: Agent
  /** MCP `serverInfo.version`; production uses this package's version. */
  version: string
}

/**
 * Connect one MCP server that lists filtered DSH tools and executes allowed names.
 * @param ctx - plugin context carrying `ctx.tools`.
 * @param options - transport, owner Agent, and server version.
 * @returns a session whose `close` undoes the `tools/change` subscription.
 */
export async function connectMcpServer(
  ctx: Context,
  options: ConnectMcpServerOptions,
): Promise<McpServerSession> {
  const skillCatalog = await resolveMcpSkillCatalog(
    ctx,
    options.agent,
    new AbortController().signal,
  )
  const server = new Server(
    { name: MCP_SERVER_NAME, version: options.version },
    {
      capabilities: { tools: { listChanged: true } },
      instructions: renderMcpSystemPrompt({ skillCatalog }),
    },
  )
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: listMcpTools(ctx.tools.schemas(options.agent)),
  }))
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => executeMcpCall(ctx, {
    name: request.params.name,
    arguments: request.params.arguments,
    signal: extra.signal,
    ...options.agent !== undefined ? { agent: options.agent } : {},
  }))
  const disposeChange = ctx.on('tools/change', () => {
    void server.sendToolListChanged()
  })
  await server.connect(options.transport)
  return {
    server,
    async close() {
      disposeChange()
      await server.close()
    },
  }
}
