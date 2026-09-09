import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { renderMcpSystemPrompt } from '@deepseek-ai/dsh-cursor-mcp-prompt'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import {
  createOwnerAgent,
  executeMcpCall,
  resolveMcpSkillCatalog,
  SYSTEM_PROMPT_TOOL_NAME,
} from '../src/index.ts'

const signal = new AbortController().signal

const skillLoader = defineTool({
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
})

async function mountSkills(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SkillRegistry)
  return ctx
}

describe('resolveMcpSkillCatalog', () => {
  it('lists model-invocable skills when dsh_skill is visible', async () => {
    const ctx = await mountSkills()
    ctx.tools.register(skillLoader)
    ctx.skills.register({
      name: 'listed-skill',
      description: 'Listed for MCP.',
      source: 'runtime',
      content: 'body',
    })
    ctx.skills.register({
      name: 'user-only-skill',
      description: 'Hidden from the model.',
      invocation: { modelInvocable: false, userInvocable: true },
      source: 'runtime',
      content: 'secret',
    })
    const result = await executeMcpCall(ctx, {
      name: SYSTEM_PROMPT_TOOL_NAME,
      arguments: {},
      signal,
    })
    const text = (result.content[0] as { text: string }).text
    expect(text).toBe(renderMcpSystemPrompt({
      skillCatalog: [{ name: 'listed-skill', description: 'Listed for MCP.' }],
    }))
    expect(text).toContain('listed-skill')
    expect(text).toContain('Listed for MCP.')
    expect(text).not.toContain('user-only-skill')
    expect(text).not.toContain('Hidden from the model.')
    await ctx.fiber.dispose()
  })

  it('publishes an empty catalog when dsh_skill is not registered', async () => {
    const ctx = await mountSkills()
    ctx.skills.register({
      name: 'listed-skill',
      description: 'Listed for MCP.',
      source: 'runtime',
      content: 'body',
    })
    const result = await executeMcpCall(ctx, {
      name: SYSTEM_PROMPT_TOOL_NAME,
      arguments: {},
      signal,
    })
    expect(result).toEqual({ content: [{ type: 'text', text: renderMcpSystemPrompt() }] })
    await ctx.fiber.dispose()
  })

  it('keeps last-good entries when a later snapshot is incomplete', async () => {
    const ctx = new Context()
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(SkillRegistry)
    ctx.tools.register(skillLoader)
    ctx.skills.register({
      name: 'listed-skill',
      description: 'Listed for MCP.',
      source: 'runtime',
      content: 'body',
    })
    const handle = await createOwnerAgent(ctx, { cwd: '' })
    const first = await resolveMcpSkillCatalog(ctx, handle.agent, signal)
    expect(first).toEqual([{ name: 'listed-skill', description: 'Listed for MCP.' }])
    let failing = true
    ctx.skills.registerProvider(() => ({
      name: 'flaky',
      async list() {
        if (failing) throw new Error('temporarily unavailable')
        return []
      },
      async get() {
        return undefined
      },
    }))
    const second = await resolveMcpSkillCatalog(ctx, handle.agent, signal)
    expect(second).toEqual(first)
    failing = false
    await handle.dispose()
    await ctx.fiber.dispose()
  })
})
