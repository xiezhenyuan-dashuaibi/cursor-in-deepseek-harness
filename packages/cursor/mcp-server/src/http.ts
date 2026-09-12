/**
 * Streamable HTTP MCP on the web Host so overlay Cursor CLIs attach instead of
 * cold-booting `dsh --profile cursor-mcp` per session.
 */

import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createOwnerAgent } from './owner.ts'
import { connectMcpServer, type McpServerSession } from './server.ts'

/** Path on {@link WebServerLike} for Cursor Streamable HTTP MCP. */
export const CURSOR_MCP_HTTP_PATH = '/cursor-mcp'

/**
 * Overlay CLI / stdio attach env. Must not use a `DSH_` prefix: overlay spawn
 * scrubs those names before they can reach `bin/stdio.mjs`.
 */
export const CURSOR_DSH_MCP_URL_ENV = 'CURSOR_DSH_MCP_URL'

/** Duck-typed `ctx.webServer` so the stdio profile has no Host dependency. */
export type WebServerLike = {
  readonly host: string
  readonly port: number
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

/**
 * True when `value` is the Host webServer service.
 * @param value - `ctx.get('webServer')`.
 * @returns whether HTTP MCP can register.
 */
export function isWebServerLike(value: unknown): value is WebServerLike {
  if (value === null || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.register === 'function'
    && typeof record.port === 'number'
    && typeof record.host === 'string'
}

/**
 * Loopback Host for this MCP route. Rejects DNS-rebinding Host names.
 * @param req - incoming HTTP request.
 * @returns whether the Host names loopback.
 */
export function isLoopbackMcpRequest(req: IncomingMessage): boolean {
  const host = req.headers.host
  if (host === undefined || host.length === 0) return false
  const hostname = host.startsWith('[')
    ? host.slice(0, host.indexOf(']') + 1).toLowerCase()
    : (host.includes(':') ? host.slice(0, host.indexOf(':')) : host).toLowerCase()
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/**
 * Overlay attach URL for a listening web Host.
 * @param port - {@link WebServerLike.port}.
 * @returns `http://127.0.0.1:{port}/cursor-mcp`.
 */
export function cursorMcpAttachUrl(port: number): string {
  return `http://127.0.0.1:${String(port)}${CURSOR_MCP_HTTP_PATH}`
}

type HttpSession = {
  transport: StreamableHTTPServerTransport
  session: McpServerSession
}

/**
 * Register `/cursor-mcp` and connect one shared owner Agent for every HTTP session.
 * @param ctx - plugin context carrying `tools` and `agents`.
 * @param web - Host HTTP server.
 * @param config - owner Agent cwd.
 * @param version - MCP `serverInfo.version`.
 * @returns after the route is registered.
 * @throws when `web.register` throws; the owner Agent is disposed first.
 */
export async function connectHttpMcp(
  ctx: Context,
  web: WebServerLike,
  config: { cwd: string },
  version: string,
): Promise<void> {
  const handle = await createOwnerAgent(ctx, config)
  const sessions = new Map<string, HttpSession>()
  try {
    const unroute = web.register({
      kind: 'exact',
      path: CURSOR_MCP_HTTP_PATH,
      handler: (req, res) => {
        void handleMcpHttp(ctx, req, res, handle.agent, version, sessions).catch(() => {
          if (!res.headersSent) res.writeHead(500).end()
        })
      },
    })
    ctx.effect(() => () => {
      unroute()
      for (const live of sessions.values()) {
        void live.session.close()
      }
      sessions.clear()
      void handle.dispose()
    }, 'cursor-mcp-server-http')
  } catch (error) {
    await handle.dispose()
    throw error
  }
}

async function handleMcpHttp(
  ctx: Context,
  req: IncomingMessage,
  res: ServerResponse,
  agent: Agent,
  version: string,
  sessions: Map<string, HttpSession>,
): Promise<void> {
  if (!isLoopbackMcpRequest(req)) {
    res.writeHead(403).end()
    return
  }
  const existingId = header(req, 'mcp-session-id')
  if (existingId !== undefined) {
    const live = sessions.get(existingId)
    if (live === undefined) {
      res.writeHead(404).end()
      return
    }
    await live.transport.handleRequest(req, res)
    return
  }
  if (req.method !== 'POST') {
    res.writeHead(400).end()
    return
  }
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  })
  const session = await connectMcpServer(ctx, { transport, agent, version })
  const liveId: { value?: string } = {}
  let closing = false
  const shutdown = (): void => {
    // session.close() re-enters transport.onclose; skip the second pass.
    if (closing) return
    closing = true
    if (liveId.value !== undefined) sessions.delete(liveId.value)
    void session.close()
  }
  transport.onclose = shutdown
  try {
    await transport.handleRequest(req, res)
  } catch (error) {
    shutdown()
    throw error
  }
  liveId.value = transport.sessionId
  if (liveId.value === undefined) {
    shutdown()
    return
  }
  sessions.set(liveId.value, { transport, session })
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
