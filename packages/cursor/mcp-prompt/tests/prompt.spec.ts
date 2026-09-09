import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import {
  renderSkillCatalogLines,
  SKILL_CATALOG_EMPTY,
  SKILL_CATALOG_INTRO,
  SKILL_CATALOG_LOAD_GUIDANCE,
} from '@deepseek-ai/dsh-tool-skill'
import * as McpPromptInvariant from '../src/invariant.ts'
import {
  apply,
  inject,
  MCP_DSH_LLM_CHILD_TOOLS,
  MCP_EXECUTION_POLICY,
  MCP_OMITTED_TOOL_NAMES,
  MCP_PREAMBLE,
  MCP_SKILL_GUIDANCE,
  MCP_SUBAGENT_CONTROL_PLANE,
  MCP_TOOL_NAMES,
  name,
  renderMcpSystemPrompt,
} from '../src/index.ts'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..')

function owner(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8')
}

describe('cursor-mcp-prompt plugin', () => {
  it('declares a loader seat with no inject', () => {
    expect(name).toBe('cursor-mcp-prompt')
    expect(inject).toEqual([])
    expect(() => { apply() }).not.toThrow()
  })
})

describe('cursor-mcp-prompt invariant companion', () => {
  it('registers the package-owned empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(McpPromptInvariant)
    await expect(fiber.await()).resolves.toBeDefined()
    await fiber.dispose()
    await expect(ctx.plugin(McpPromptInvariant).await()).resolves.toBeDefined()
    await ctx.fiber.dispose()
  })
})

describe('renderMcpSystemPrompt', () => {
  const prompt = renderMcpSystemPrompt()
  const populated = renderMcpSystemPrompt({
    skillCatalog: [
      { name: 'listed-skill', description: 'Use {{placeholder}} <safely> & carefully.' },
    ],
  })

  it('keeps skill guidance byte-aligned with the owning plugin', () => {
    expect(owner('packages/skill/tool-skill/src/index.ts')).toContain(MCP_SKILL_GUIDANCE)
    expect(owner('packages/skill/tool-skill/src/catalog-render.ts')).toContain(SKILL_CATALOG_INTRO)
    expect(owner('packages/skill/tool-skill/src/catalog-render.ts')).toContain(SKILL_CATALOG_LOAD_GUIDANCE)
    expect(owner('packages/skill/tool-skill/src/catalog-render.ts')).toContain(SKILL_CATALOG_EMPTY)
    expect(prompt).toContain(SKILL_CATALOG_EMPTY)
    expect(prompt).not.toContain('<available_skills>')
    expect(populated).toContain(SKILL_CATALOG_INTRO)
    expect(populated).toContain(SKILL_CATALOG_LOAD_GUIDANCE)
    expect(populated).toContain(renderSkillCatalogLines([
      { name: 'listed-skill', description: 'Use {{placeholder}} <safely> & carefully.' },
    ])[0])
    expect(populated).not.toContain(SKILL_CATALOG_EMPTY)
    expect(owner('packages/jobs/tool-jobs/src/index.ts')).toContain(
      'Track every background job id you start. You are notified in-session when a job finishes',
    )
    expect(owner('packages/subagent/tool-subagent/src/index.ts')).toContain(
      'Use ${toolName} in the background by default. Start independent delegations together',
    )
    expect(owner('packages/workflow/tool-workflow/src/index.ts')).toContain(
      'ONLY when the user explicitly asks for a workflow or for large multi-agent orchestration',
    )
    expect(owner('packages/workflow/tool-ralph/src/index.ts')).toContain(
      'ONLY when the direct human explicitly asks for a Ralph loop',
    )
  })

  it('names every standard-preset extra tool once and omits Cursor clones, the DSH subagent control plane, and DSH LLM-child tools', () => {
    expect(new Set(MCP_TOOL_NAMES).size).toBe(MCP_TOOL_NAMES.length)
    expect(MCP_TOOL_NAMES.filter(tool => (MCP_OMITTED_TOOL_NAMES as readonly string[]).includes(tool))).toEqual([])
    for (const tool of MCP_SUBAGENT_CONTROL_PLANE) {
      expect(MCP_OMITTED_TOOL_NAMES).toContain(tool)
    }
    for (const tool of MCP_DSH_LLM_CHILD_TOOLS) {
      expect(MCP_OMITTED_TOOL_NAMES).toContain(tool)
    }
    for (const tool of MCP_TOOL_NAMES) expect(prompt).toContain(tool)
    for (const tool of MCP_OMITTED_TOOL_NAMES) expect(prompt).not.toContain(tool)
  })

  it('does not teach this checkout\'s spine prefixes to every overlay workspace', () => {
    expect(prompt).not.toContain('packages/core')
    expect(prompt).not.toContain('packages/boot')
    expect(prompt).not.toContain('vendor/')
    expect(prompt).not.toContain('native/')
  })

  it('orients extra-tool use without native identity, persona, or file/shell/search hygiene', () => {
    expect(prompt).toContain('DeepSeek Harness extras to Cursor')
    expect(prompt).toContain('dsh_system_prompt')
    expect(prompt).not.toContain('You are Cursor hosted by DeepSeek Harness')
    expect(prompt).not.toContain('You are an AI agent powered by DeepSeek Harness.')
    expect(prompt).not.toContain('You are a coding agent powered by')
    expect(prompt).not.toContain('Your working directory is')
    expect(prompt).not.toContain('Prefer dsh_read')
    expect(prompt).not.toContain('use pwd for cwd')
  })

  it('states Cursor owns overlapping tools and DSH still enforces sandbox and approval', () => {
    expect(prompt).toContain(MCP_PREAMBLE)
    expect(prompt).toContain(MCP_EXECUTION_POLICY)
    expect(prompt).toContain('or subagents')
  })

  it('quotes the empty projection in the package README Model Experience fence', () => {
    const readme = readFileSync(join(repoRoot, 'packages/cursor/mcp-prompt/README.md'), 'utf8')
    expect(readme).toContain(prompt)
    expect(readme).toContain(SKILL_CATALOG_INTRO)
    expect(readme).toContain('<available_skills>')
    expect(readme).toContain(SKILL_CATALOG_LOAD_GUIDANCE)
  })
})
