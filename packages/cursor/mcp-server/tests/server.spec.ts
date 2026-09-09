import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'
import { Context } from '@deepseek-ai/cordis'
import AgentDefaultModelConfig from '@deepseek-ai/dsh-agent-default-model'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { renderMcpSystemPrompt } from '@deepseek-ai/dsh-cursor-mcp-prompt'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  apply,
  Config,
  connectMcpServer,
  createOwnerAgent,
  internals,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
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

async function mountLoop(): Promise<Context> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  return ctx
}

describe('internals.createTransport', () => {
  it('defaults to stdio without connecting', async () => {
    const transport = internals.createTransport()
    expect(transport).toBeInstanceOf(StdioServerTransport)
    await transport.close()
  })
})

describe('connectMcpServer', () => {
  it('advertises instructions, filtered tools, system prompt, and listChanged', async () => {
    const ctx = await mountLoop()
    ctx.tools.register(defineTool({
      name: 'dsh_read',
      description: 'omit',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute() {
        return 'nope'
      },
    }))
    ctx.tools.register(extra)
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const session = await connectMcpServer(ctx, {
      transport: serverTransport,
      version: MCP_SERVER_VERSION,
    })
    const client = new Client({ name: 'test', version: '0' })
    const listedChanged: PromiseWithResolvers<void> = Promise.withResolvers()
    client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
      listedChanged.resolve()
    })
    await client.connect(clientTransport)
    expect(client.getServerVersion()?.name).toBe(MCP_SERVER_NAME)
    expect(client.getInstructions()).toBe(renderMcpSystemPrompt())
    const first = await client.listTools()
    expect(first.tools.map(tool => tool.name)).toContain(SYSTEM_PROMPT_TOOL_NAME)
    expect(first.tools.map(tool => tool.name)).toContain('dsh_live_extra')
    expect(first.tools.map(tool => tool.name)).not.toContain('dsh_read')
    const prompt = await client.callTool({ name: SYSTEM_PROMPT_TOOL_NAME })
    expect(prompt.content).toEqual([{ type: 'text', text: renderMcpSystemPrompt() }])
    const echoed = await client.callTool({ name: 'dsh_live_extra', arguments: { text: 'ok' } })
    expect(echoed.content).toEqual([{ type: 'text', text: 'ok' }])
    const omitted = await client.callTool({ name: 'dsh_read', arguments: {} })
    expect(omitted.isError).toBe(true)
    ctx.tools.register(defineTool({
      name: 'dsh_another_extra',
      description: 'wf',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute() {
        return 'wf'
      },
    }))
    await listedChanged.promise
    const second = await client.listTools()
    expect(second.tools.map(tool => tool.name)).toContain('dsh_another_extra')
    await session.close()
    await client.close()
    await ctx.fiber.dispose()
  })

  it('embeds the live skill catalog in initialize instructions and dsh_system_prompt', async () => {
    const ctx = await mountLoop()
    await ctx.plugin(SkillRegistry)
    ctx.tools.register(defineTool({
      name: 'dsh_skill',
      description: 'load',
      parameters: { name: { type: 'string', required: true } },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute() {
        return ''
      },
    }))
    ctx.skills.register({
      name: 'listed-skill',
      description: 'Listed for MCP.',
      source: 'runtime',
      content: 'body',
    })
    const handle = await createOwnerAgent(ctx, { cwd: '' })
    const expected = renderMcpSystemPrompt({
      skillCatalog: [{ name: 'listed-skill', description: 'Listed for MCP.' }],
    })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const session = await connectMcpServer(ctx, {
      transport: serverTransport,
      agent: handle.agent,
      version: MCP_SERVER_VERSION,
    })
    const client = new Client({ name: 'test', version: '0' })
    await client.connect(clientTransport)
    expect(client.getInstructions()).toBe(expected)
    const prompt = await client.callTool({ name: SYSTEM_PROMPT_TOOL_NAME })
    expect(prompt.content).toEqual([{ type: 'text', text: expected }])
    await session.close()
    await client.close()
    await handle.dispose()
    await ctx.fiber.dispose()
  })
})

describe('createOwnerAgent', () => {
  it('uses process.cwd when config.cwd is empty and an explicit cwd otherwise', async () => {
    const ctx = await mountLoop()
    const implicit = await createOwnerAgent(ctx, { cwd: '' })
    expect(String(implicit.agent.session.id).startsWith('mcp-')).toBe(true)
    await implicit.dispose()
    await ctx.plugin(AgentDefaultModelConfig, { provider: 'mock', model: 'mock' })
    const dir = mkdtempSync(join(tmpdir(), 'dsh-mcp-cwd-'))
    const explicit = await createOwnerAgent(ctx, { cwd: dir })
    expect(explicit.agent).toBeDefined()
    await explicit.dispose()
    await ctx.fiber.dispose()
  })
})

describe('apply', () => {
  const originalCreateTransport = (): Transport => new StdioServerTransport()

  afterEach(() => {
    internals.createTransport = originalCreateTransport
  })

  function installFakeLoader(ctx: Context, awaiter: () => Promise<unknown>): void {
    const originalGet: Context['get'] = ctx.get.bind(ctx)
    ctx.get = ((name: string) => {
      if (name === 'loader') return { await: awaiter }
      // Service lookup return is untyped across the Cordis store.
      // oxlint-disable-next-line typescript/no-unsafe-return
      return originalGet(name)
    }) as Context['get']
  }

  it('connects MCP over the injected transport and disposes the owner Agent', async () => {
    const ctx = await mountLoop()
    ctx.tools.register(extra)
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    internals.createTransport = () => serverTransport
    await apply(ctx, Config({}))
    const client = new Client({ name: 'test', version: '0' })
    await client.connect(clientTransport)
    const listed = await client.listTools()
    expect(listed.tools.map(tool => tool.name)).toContain(SYSTEM_PROMPT_TOOL_NAME)
    expect(listed.tools.map(tool => tool.name)).toContain('dsh_live_extra')
    const echoed = await client.callTool({ name: 'dsh_live_extra', arguments: { text: 'via-apply' } })
    expect(echoed.content).toEqual([{ type: 'text', text: 'via-apply' }])
    expect(ctx.agents.list()).toHaveLength(1)
    await ctx.fiber.dispose()
    await client.close()
  })

  it('disposes the owner Agent when MCP connect fails', async () => {
    const ctx = await mountLoop()
    internals.createTransport = () => {
      throw new Error('transport failed')
    }
    await expect(apply(ctx, { cwd: '' })).rejects.toThrow('transport failed')
    expect(ctx.agents.list()).toHaveLength(0)
    await ctx.fiber.dispose()
  })

  it('returns before Loader settlement and connects after it', async () => {
    const ctx = await mountLoop()
    ctx.tools.register(extra)
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    internals.createTransport = () => serverTransport
    let resolveSettle: (value: undefined) => void = () => {
      /* assigned when settle is constructed */
    }
    const settle = new Promise<undefined>((resolve) => {
      resolveSettle = resolve
    })
    installFakeLoader(ctx, () => settle)
    const started = apply(ctx, Config({}))
    await expect(started).resolves.toBeUndefined()
    expect(ctx.agents.list()).toHaveLength(0)
    resolveSettle(undefined)
    await vi.waitFor(() => {
      expect(ctx.agents.list()).toHaveLength(1)
    })
    const client = new Client({ name: 'test', version: '0' })
    await client.connect(clientTransport)
    const listed = await client.listTools()
    expect(listed.tools.map(tool => tool.name)).toContain('dsh_live_extra')
    await ctx.fiber.dispose()
    await client.close()
  })

  it('writes connect failure to stderr after Loader settlement', async () => {
    const ctx = await mountLoop()
    internals.createTransport = () => {
      throw new Error('transport failed')
    }
    installFakeLoader(ctx, () => Promise.resolve())
    const spy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    await apply(ctx, { cwd: '' })
    await vi.waitFor(() => {
      expect(spy.mock.calls.some(call => String(call[0]).includes('transport failed'))).toBe(true)
    })
    spy.mockRestore()
    await ctx.fiber.dispose()
  })
})
