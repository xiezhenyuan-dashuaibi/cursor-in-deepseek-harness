import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  proxyStdioToHttp as proxyStdioToHttpUntyped,
  waitForMcpHttp as waitForMcpHttpUntyped,
} from '../bin/stdio-http-proxy.mjs'

const waitForMcpHttp = waitForMcpHttpUntyped as (url: string, timeoutMs: number) => Promise<boolean>
const proxyStdioToHttp = proxyStdioToHttpUntyped as (
  url: string,
  stdin?: NodeJS.ReadableStream,
  stdout?: NodeJS.WritableStream,
) => Promise<void>

describe('waitForMcpHttp', () => {
  let server: ReturnType<typeof createServer> | undefined

  afterEach(async () => {
    if (server === undefined) return
    await new Promise<void>((resolve) => {
      server!.close(() => { resolve() })
    })
    server = undefined
  })

  it('returns true once the URL answers', async () => {
    server = createServer((_req, res) => {
      res.writeHead(400).end()
    })
    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('expected AddressInfo')
    await expect(waitForMcpHttp(`http://127.0.0.1:${String(address.port)}/cursor-mcp`, 2_000)).resolves.toBe(true)
  })

  it('returns false when nothing listens', async () => {
    await expect(waitForMcpHttp('http://127.0.0.1:1/cursor-mcp', 250)).resolves.toBe(false)
  })
})

describe('proxyStdioToHttp', () => {
  let server: ReturnType<typeof createServer> | undefined

  afterEach(async () => {
    if (server === undefined) return
    await new Promise<void>((resolve) => {
      server!.close(() => { resolve() })
    })
    server = undefined
  })

  it('forwards JSON-RPC and SSE data lines', async () => {
    server = createServer((req, res) => {
      if (req.method === 'GET') {
        res.writeHead(400).end()
        return
      }
      res.setHeader('mcp-session-id', 'sess-1')
      res.setHeader('content-type', 'text/event-stream')
      res.writeHead(200)
      res.end('data:\n\ndata: [DONE]\n\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n')
    })
    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('expected AddressInfo')
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const chunks: string[] = []
    stdout.setEncoding('utf8')
    stdout.on('data', (chunk: string) => { chunks.push(chunk) })
    const pending = proxyStdioToHttp(`http://127.0.0.1:${String(address.port)}/mcp`, stdin, stdout)
    stdin.write('\n{"jsonrpc":"2.0","id":1,"method":"ping"}\n')
    stdin.end()
    await pending
    expect(chunks.join('')).toContain('"ok":true')
  })

  it('forwards application/json bodies', async () => {
    server = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json')
      res.writeHead(200)
      res.end(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { n: 1 } }))
    })
    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('expected AddressInfo')
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const chunks: string[] = []
    stdout.setEncoding('utf8')
    stdout.on('data', (chunk: string) => { chunks.push(chunk) })
    const pending = proxyStdioToHttp(`http://127.0.0.1:${String(address.port)}/mcp`, stdin, stdout)
    stdin.write('{"jsonrpc":"2.0","id":2,"method":"ping"}\n')
    stdin.end()
    await pending
    expect(chunks.join('')).toContain('"n":1')
  })

  it('forwards an empty HTTP body as no JSON-RPC line', async () => {
    server = createServer((_req, res) => {
      res.setHeader('mcp-session-id', 'sess-empty')
      res.setHeader('content-type', 'application/json')
      res.writeHead(202)
      res.end()
    })
    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('expected AddressInfo')
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const chunks: string[] = []
    stdout.setEncoding('utf8')
    stdout.on('data', (chunk: string) => { chunks.push(chunk) })
    const pending = proxyStdioToHttp(`http://127.0.0.1:${String(address.port)}/mcp`, stdin, stdout)
    stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n')
    stdin.end()
    await pending
    expect(chunks.join('')).toBe('')
  })

  it('sends mcp-session-id on later posts', async () => {
    const seen: Array<string | undefined> = []
    server = createServer((req, res) => {
      const header = req.headers['mcp-session-id']
      seen.push(typeof header === 'string' ? header : undefined)
      res.setHeader('mcp-session-id', 'sess-1')
      res.setHeader('content-type', 'application/json')
      res.writeHead(200)
      res.end(JSON.stringify({ jsonrpc: '2.0', id: seen.length, result: { n: seen.length } }))
    })
    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('expected AddressInfo')
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const pending = proxyStdioToHttp(`http://127.0.0.1:${String(address.port)}/mcp`, stdin, stdout)
    stdin.write('{"jsonrpc":"2.0","id":1,"method":"initialize"}\n')
    stdin.write('{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n')
    stdin.end()
    await pending
    expect(seen).toEqual([undefined, 'sess-1'])
  })
})

describe('stdio.mjs attach entry', () => {
  let server: ReturnType<typeof createServer> | undefined
  let child: ChildProcessWithoutNullStreams | undefined

  afterEach(async () => {
    child?.kill()
    child = undefined
    if (server === undefined) return
    await new Promise<void>((resolve) => {
      server!.close(() => { resolve() })
    })
    server = undefined
  })

  it('proxies initialize when CURSOR_DSH_MCP_URL answers', async () => {
    server = createServer((req, res) => {
      if (req.method === 'GET') {
        res.writeHead(400).end()
        return
      }
      res.setHeader('mcp-session-id', 'sess-entry')
      res.setHeader('content-type', 'application/json')
      res.writeHead(200)
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'dsh', version: '0' },
        },
      }))
    })
    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('expected AddressInfo')
    const stdioPath = join(dirname(fileURLToPath(import.meta.url)), '../bin/stdio.mjs')
    child = spawn(process.execPath, [stdioPath], {
      env: {
        ...process.env,
        CURSOR_DSH_MCP_URL: `http://127.0.0.1:${String(address.port)}/cursor-mcp`,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const chunks: string[] = []
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { chunks.push(chunk) })
    child.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 't', version: '0' },
      },
    })}\n`)
    child.stdin.end()
    await new Promise<void>((resolve, reject) => {
      child!.on('exit', () => { resolve() })
      child!.on('error', reject)
    })
    expect(chunks.join('')).toContain('"name":"dsh"')
  })
})
