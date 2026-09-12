import http from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  apply,
  Config,
  CURSOR_MCP_HTTP_PATH,
  cursorMcpAttachUrl,
  isLoopbackMcpRequest,
  isWebServerLike,
  SYSTEM_PROMPT_TOOL_NAME,
} from '../src/index.ts'

const extra = defineTool({
  name: 'dsh_live_extra',
  description: 'echo',
  parameters: { text: { type: 'string' } },
  output: {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  async execute(args) {
    return args.text ?? ''
  },
})

async function mountWebMcp(): Promise<{ ctx: Context; url: string }> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.tools.register(extra)
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  await apply(ctx, Config({}))
  return { ctx, url: cursorMcpAttachUrl(ctx.webServer.port) }
}

describe('isLoopbackMcpRequest', () => {
  it('accepts IPv4 loopback and localhost Host', () => {
    expect(isLoopbackMcpRequest({ headers: { host: '127.0.0.1:3080' } } as http.IncomingMessage)).toBe(true)
    expect(isLoopbackMcpRequest({ headers: { host: '127.0.0.1' } } as http.IncomingMessage)).toBe(true)
    expect(isLoopbackMcpRequest({ headers: { host: '127.1.2.3' } } as http.IncomingMessage)).toBe(true)
    expect(isLoopbackMcpRequest({ headers: { host: 'localhost:3080' } } as http.IncomingMessage)).toBe(true)
    expect(isLoopbackMcpRequest({ headers: { host: '[::1]:3080' } } as http.IncomingMessage)).toBe(true)
    expect(isLoopbackMcpRequest({ headers: { host: '[::1]' } } as http.IncomingMessage)).toBe(true)
  })

  it('rejects missing or non-loopback Host', () => {
    expect(isLoopbackMcpRequest({ headers: {} } as http.IncomingMessage)).toBe(false)
    expect(isLoopbackMcpRequest({ headers: { host: '' } } as http.IncomingMessage)).toBe(false)
    expect(isLoopbackMcpRequest({ headers: { host: 'evil.example:3080' } } as http.IncomingMessage)).toBe(false)
    expect(isLoopbackMcpRequest({ headers: { host: '126.0.0.1:3080' } } as http.IncomingMessage)).toBe(false)
    expect(isLoopbackMcpRequest({ headers: { host: '127.0.0.256' } } as http.IncomingMessage)).toBe(false)
    expect(isLoopbackMcpRequest({ headers: { host: '127.0.0' } } as http.IncomingMessage)).toBe(false)
    expect(isLoopbackMcpRequest({ headers: { host: '[::1' } } as http.IncomingMessage)).toBe(false)
  })
})

describe('isWebServerLike', () => {
  it('requires register, host, and port', () => {
    expect(isWebServerLike(undefined)).toBe(false)
    expect(isWebServerLike(null)).toBe(false)
    expect(isWebServerLike({})).toBe(false)
    expect(isWebServerLike({ host: '127.0.0.1', port: 3080 })).toBe(false)
    expect(isWebServerLike({ host: '127.0.0.1', port: '3080', register: () => () => {} })).toBe(false)
    expect(isWebServerLike({ host: 1, port: 3080, register: () => () => {} })).toBe(false)
    expect(isWebServerLike({
      host: '127.0.0.1',
      port: 3080,
      register: () => () => {},
    })).toBe(true)
  })
})

describe('cursorMcpAttachUrl', () => {
  it('points at loopback /cursor-mcp', () => {
    expect(cursorMcpAttachUrl(3080)).toBe(`http://127.0.0.1:3080${CURSOR_MCP_HTTP_PATH}`)
  })
})

describe('HTTP MCP on webServer', () => {
  let ctx: Context | undefined

  afterEach(async () => {
    if (ctx !== undefined) await ctx.fiber.dispose()
    ctx = undefined
    vi.restoreAllMocks()
  })

  it('lists and calls extras over Streamable HTTP', async () => {
    const mounted = await mountWebMcp()
    ctx = mounted.ctx
    const client = new Client({ name: 'test', version: '0' })
    const transport = new StreamableHTTPClientTransport(new URL(mounted.url)) as Transport
    await client.connect(transport)
    const listed = await client.listTools()
    const names = listed.tools.map(tool => tool.name)
    expect(names).toContain(SYSTEM_PROMPT_TOOL_NAME)
    expect(names).toContain('dsh_live_extra')
    const echoed = await client.callTool({ name: 'dsh_live_extra', arguments: { text: 'via-http' } })
    expect(echoed.content).toEqual([{ type: 'text', text: 'via-http' }])
    await client.close()
  })

  it('reuses one owner Agent across HTTP sessions', async () => {
    const mounted = await mountWebMcp()
    ctx = mounted.ctx
    const first = new Client({ name: 'a', version: '0' })
    const second = new Client({ name: 'b', version: '0' })
    await first.connect(new StreamableHTTPClientTransport(new URL(mounted.url)) as Transport)
    await second.connect(new StreamableHTTPClientTransport(new URL(mounted.url)) as Transport)
    expect(ctx.agents.list()).toHaveLength(1)
    await first.close()
    await second.close()
  })

  it('rejects a non-loopback Host', async () => {
    const mounted = await mountWebMcp()
    ctx = mounted.ctx
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(mounted.url, {
        method: 'POST',
        headers: { host: 'evil.example:3080', 'content-type': 'application/json' },
      }, (res) => {
        res.resume()
        resolve(res.statusCode ?? 0)
      })
      req.on('error', reject)
      req.end('{}')
    })
    expect(status).toBe(403)
  })

  it('returns 400 for GET without a session', async () => {
    const mounted = await mountWebMcp()
    ctx = mounted.ctx
    const res = await fetch(mounted.url, { method: 'GET', headers: { Accept: 'text/event-stream' } })
    expect(res.status).toBe(400)
  })

  it('returns 404 for an unknown MCP session', async () => {
    const mounted = await mountWebMcp()
    ctx = mounted.ctx
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(mounted.url, {
        method: 'POST',
        headers: {
          host: `127.0.0.1:${String(ctx!.webServer.port)}`,
          'content-type': 'application/json',
          'mcp-session-id': 'missing-session',
        },
      }, (res) => {
        res.resume()
        resolve(res.statusCode ?? 0)
      })
      req.on('error', reject)
      req.end('{}')
    })
    expect(status).toBe(404)
  })

  it('removes a session when the HTTP transport closes', async () => {
    const spy = vi.spyOn(StreamableHTTPServerTransport.prototype, 'handleRequest')
      .mockImplementationOnce(async function (this: StreamableHTTPServerTransport, _req, res) {
        Object.defineProperty(this, 'sessionId', { configurable: true, get: () => 'sess-close' })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{}')
      })
    const mounted = await mountWebMcp()
    ctx = mounted.ctx
    await fetch(mounted.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Accept: 'application/json' },
      body: '{}',
    })
    const captured = spy.mock.contexts[0] as StreamableHTTPServerTransport | undefined
    expect(captured).toBeDefined()
    captured?.onclose?.()
    captured?.onclose?.()
    const res = await fetch(mounted.url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'content-type': 'application/json',
        'mcp-session-id': 'sess-close',
      },
      body: '{}',
    })
    expect(res.status).toBe(404)
  })

  it('writes 500 when handleRequest throws before headers', async () => {
    vi.spyOn(StreamableHTTPServerTransport.prototype, 'handleRequest')
      .mockRejectedValueOnce(new Error('boom'))
    const mounted = await mountWebMcp()
    ctx = mounted.ctx
    const res = await fetch(mounted.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Accept: 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(500)
  })

  it('does not write 500 when handleRequest throws after headers', async () => {
    vi.spyOn(StreamableHTTPServerTransport.prototype, 'handleRequest')
      .mockImplementationOnce(async (_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{}')
        throw new Error('after headers')
      })
    const mounted = await mountWebMcp()
    ctx = mounted.ctx
    const res = await fetch(mounted.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Accept: 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(200)
  })

  it('closes a POST that never receives a session id', async () => {
    vi.spyOn(StreamableHTTPServerTransport.prototype, 'handleRequest')
      .mockImplementationOnce(async (_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{}')
      })
    const mounted = await mountWebMcp()
    ctx = mounted.ctx
    const res = await fetch(mounted.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Accept: 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(200)
    expect(ctx.agents.list()).toHaveLength(1)
  })

  it('disposes the owner when HTTP route register throws', async () => {
    const mounted = new Context()
    ctx = mounted
    await mountAgentLoopTestDependencies(mounted)
    await mounted.plugin(AgentLoop, { agents: [] })
    mounted.provide('webServer', {
      host: '127.0.0.1',
      port: 1,
      register() {
        throw new Error('dup')
      },
    })
    await expect(apply(mounted, Config({}))).rejects.toThrow('dup')
    expect(mounted.agents.list()).toHaveLength(0)
  })
})
