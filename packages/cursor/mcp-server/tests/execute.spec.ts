import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId, type ContentBlock } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture, defineTool } from '@deepseek-ai/dsh-tools'
import {
  MCP_DSH_LLM_CHILD_TOOLS,
  MCP_SUBAGENT_CONTROL_PLANE,
  renderMcpSystemPrompt,
} from '@deepseek-ai/dsh-cursor-mcp-prompt'
import {
  contentBlockToMcpText,
  executeMcpCall,
  jsonToolArguments,
  mapToolResult,
  SYSTEM_PROMPT_TOOL_NAME,
} from '../src/index.ts'

const signal = new AbortController().signal

async function mountTools(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  return ctx
}

describe('jsonToolArguments', () => {
  it('keeps a plain object and replaces every other JSON value with {}', () => {
    expect(jsonToolArguments({ a: 1 })).toEqual({ a: 1 })
    expect(jsonToolArguments(undefined)).toEqual({})
    expect(jsonToolArguments(null)).toEqual({})
    expect(jsonToolArguments('x')).toEqual({})
    expect(jsonToolArguments([1])).toEqual({})
  })
})

describe('contentBlockToMcpText', () => {
  it('maps known tags and JSON-stringifies merge-extensible unknowns', () => {
    expect(contentBlockToMcpText({ type: 'text', text: 'hi' })).toEqual({ type: 'text', text: 'hi' })
    expect(contentBlockToMcpText({ type: 'reasoning', text: 'think' })).toEqual({
      type: 'text',
      text: 'think',
    })
    expect(contentBlockToMcpText({ type: 'image', attachment: { id: 'att' } } as ContentBlock))
      .toEqual({ type: 'text', text: '[image]' })
    expect(contentBlockToMcpText({
      type: 'tool-call',
      id: CallId('c1'),
      name: 'dsh_skill',
      arguments: '{}',
    })).toEqual({
      type: 'text',
      text: JSON.stringify({
        type: 'tool-call',
        id: 'c1',
        name: 'dsh_skill',
        arguments: '{}',
      }),
    })
    expect(contentBlockToMcpText({
      type: 'tool-result',
      toolCallId: CallId('c1'),
      content: [{ type: 'text', text: 'ok' }],
    }).text).toContain('tool-result')
    expect(contentBlockToMcpText({ type: 'ext' } as ContentBlock)).toEqual({
      type: 'text',
      text: JSON.stringify({ type: 'ext' }),
    })
  })
})

describe('mapToolResult', () => {
  it('substitutes empty content and forwards isError', () => {
    expect(mapToolResult({
      isError: false,
      content: [],
      value: null,
    })).toEqual({ content: [{ type: 'text', text: '(no output)' }] })
    expect(mapToolResult({
      isError: true,
      content: [{ type: 'text', text: 'fail' }],
      value: null,
    })).toEqual({
      content: [{ type: 'text', text: 'fail' }],
      isError: true,
    })
  })
})

describe('executeMcpCall', () => {
  it('returns the mcp-prompt projection for dsh_system_prompt', async () => {
    const ctx = await mountTools()
    const result = await executeMcpCall(ctx, {
      name: SYSTEM_PROMPT_TOOL_NAME,
      arguments: {},
      signal,
    })
    expect(result).toEqual({ content: [{ type: 'text', text: renderMcpSystemPrompt() }] })
    await ctx.fiber.dispose()
  })

  it('refuses omitted names without executing them', async () => {
    const ctx = await mountTools()
    let ran = false
    ctx.tools.register(defineTool({
      name: 'dsh_read',
      description: 'must not run',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute() {
        ran = true
        return 'secret'
      },
    }))
    const result = await executeMcpCall(ctx, { name: 'dsh_read', arguments: {}, signal })
    expect(ran).toBe(false)
    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'MCP omits "dsh_read"; use Cursor\'s own tool.',
    })
    let goalRan = false
    ctx.tools.register(defineTool({
      name: 'dsh_create_goal',
      description: 'must not run',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute() {
        goalRan = true
        return 'nope'
      },
    }))
    const goal = await executeMcpCall(ctx, {
      name: 'dsh_create_goal',
      arguments: { objective: 'x' },
      signal,
    })
    expect(goalRan).toBe(false)
    expect(goal.isError).toBe(true)
    expect(goal.content[0]).toEqual({
      type: 'text',
      text: 'MCP omits "dsh_create_goal"; use Cursor\'s own tool.',
    })
    await ctx.fiber.dispose()
  })

  it('refuses the omitted DSH subagent control plane without executing it', async () => {
    const ctx = await mountTools()
    const ran = new Map<string, boolean>()
    for (const name of MCP_SUBAGENT_CONTROL_PLANE) {
      ran.set(name, false)
      ctx.tools.register(defineTool({
        name,
        description: 'must not run',
        parameters: {},
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }],
        },
        async execute() {
          ran.set(name, true)
          return 'secret'
        },
      }))
      const result = await executeMcpCall(ctx, { name, arguments: {}, signal })
      expect(ran.get(name)).toBe(false)
      expect(result.isError).toBe(true)
      expect(result.content[0]).toEqual({
        type: 'text',
        text: `MCP omits "${name}"; use Cursor's own tool.`,
      })
    }
    await ctx.fiber.dispose()
  })

  it('refuses omitted DSH LLM-child tools without executing them', async () => {
    const ctx = await mountTools()
    const ran = new Map<string, boolean>()
    for (const name of MCP_DSH_LLM_CHILD_TOOLS) {
      ran.set(name, false)
      ctx.tools.register(defineTool({
        name,
        description: 'must not run',
        parameters: {},
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }],
        },
        async execute() {
          ran.set(name, true)
          return 'secret'
        },
      }))
      const result = await executeMcpCall(ctx, { name, arguments: {}, signal })
      expect(ran.get(name)).toBe(false)
      expect(result.isError).toBe(true)
      expect(result.content[0]).toEqual({
        type: 'text',
        text: `MCP omits "${name}"; use Cursor's own tool.`,
      })
    }
    await ctx.fiber.dispose()
  })

  it('executes a live extra tool with JSON object arguments', async () => {
    const ctx = await mountTools()
    ctx.tools.register(defineTool({
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
    }))
    const result = await executeMcpCall(ctx, {
      name: 'dsh_live_extra',
      arguments: { text: 'go' },
      signal,
      agent: { id: 'unused-for-echo' } as never,
    })
    expect(result).toEqual({ content: [{ type: 'text', text: 'go' }] })
    await ctx.fiber.dispose()
  })

  it('returns the registry unknown-tool error for an unregistered name', async () => {
    const ctx = await mountTools()
    const result = await executeMcpCall(ctx, { name: 'dsh_missing', arguments: {}, signal })
    expect(result.isError).toBe(true)
    expect(result.content[0]?.type).toBe('text')
    expect((result.content[0] as { text: string }).text).toContain('unknown tool')
    await ctx.fiber.dispose()
  })

  it('maps a content-only extra tool', async () => {
    const ctx = await mountTools()
    ctx.tools.register(defineContentToolFixture({
      name: 'dsh_skill',
      description: 'skill',
      parameters: {},
      async execute() {
        return [{ type: 'text' as const, text: 'none' }]
      },
    }))
    const result = await executeMcpCall(ctx, { name: 'dsh_skill', arguments: 'not-json-object', signal })
    expect(result).toEqual({ content: [{ type: 'text', text: 'none' }] })
    await ctx.fiber.dispose()
  })
})
