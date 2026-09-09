import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { MCP_OMITTED_TOOL_NAMES } from '@deepseek-ai/dsh-cursor-mcp-prompt'
import type { ToolSchema } from '@deepseek-ai/dsh-llm'
import * as McpServerInvariant from '../src/invariant.ts'
import {
  isOmittedMcpToolName,
  listMcpTools,
  MCP_SERVER_VERSION,
  SYSTEM_PROMPT_TOOL_DESCRIPTION,
  SYSTEM_PROMPT_TOOL_NAME,
  toMcpInputSchema,
} from '../src/index.ts'
import * as mcpServer from '../src/index.ts'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..')

describe('cursor-mcp-server real-load-path guard', () => {
  it('has no default export and keeps name/inject/Config through unwrapExports', () => {
    expect('default' in mcpServer).toBe(false)
    const loader = Object.create(Loader.prototype) as Loader
    const unwrapped = loader.unwrapExports(mcpServer) as Record<string, unknown>
    expect(unwrapped).toBe(mcpServer)
    expect(unwrapped.name).toBe('cursor-mcp-server')
    expect(unwrapped.inject).toEqual(['tools', 'agents'])
    expect(typeof unwrapped.apply).toBe('function')
    expect(unwrapped.Config).toBeDefined()
  })
})

describe('cursor-mcp-server invariant companion', () => {
  it('registers the package-owned empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(McpServerInvariant)
    await expect(fiber.await()).resolves.toBeDefined()
    await fiber.dispose()
    await expect(ctx.plugin(McpServerInvariant).await()).resolves.toBeDefined()
    await ctx.fiber.dispose()
  })
})

describe('listMcpTools', () => {
  const omitted: ToolSchema[] = MCP_OMITTED_TOOL_NAMES.map(name => ({
    name,
    description: name,
    parameters: { type: 'object', properties: {} },
  }))
  const extra: ToolSchema = {
    name: 'dsh_live_extra',
    description: 'live extra',
    parameters: { type: 'object', properties: { task: { type: 'string' } } },
  }
  const custom: ToolSchema = {
    name: 'dsh_custom_extra',
    description: 'custom',
    parameters: { text: { type: 'string' } },
  }

  it('always leads with dsh_system_prompt and drops omitted names', () => {
    const tools = listMcpTools([...omitted, extra, custom])
    expect(tools[0]?.name).toBe(SYSTEM_PROMPT_TOOL_NAME)
    expect(tools[0]?.description).toBe(SYSTEM_PROMPT_TOOL_DESCRIPTION)
    expect(tools.map(tool => tool.name)).toEqual([
      SYSTEM_PROMPT_TOOL_NAME,
      'dsh_live_extra',
      'dsh_custom_extra',
    ])
    for (const name of MCP_OMITTED_TOOL_NAMES) {
      expect(isOmittedMcpToolName(name)).toBe(true)
      expect(tools.some(tool => tool.name === name)).toBe(false)
    }
  })

  it('does not duplicate a registry row named dsh_system_prompt', () => {
    const tools = listMcpTools([{
      name: SYSTEM_PROMPT_TOOL_NAME,
      description: 'stale',
      parameters: { type: 'object', properties: {} },
    }])
    expect(tools.filter(tool => tool.name === SYSTEM_PROMPT_TOOL_NAME)).toHaveLength(1)
    expect(tools[0]?.description).toBe(SYSTEM_PROMPT_TOOL_DESCRIPTION)
  })

  it('wraps a non-object parameter record as MCP properties', () => {
    expect(toMcpInputSchema({ text: { type: 'string' } })).toEqual({
      type: 'object',
      properties: { text: { type: 'string' } },
    })
    expect(toMcpInputSchema({ type: 'object', properties: { n: { type: 'number' } } })).toEqual({
      type: 'object',
      properties: { n: { type: 'number' } },
    })
  })
})

describe('MCP_SERVER_VERSION', () => {
  it('matches this package.json version', () => {
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, 'packages/cursor/mcp-server/package.json'), 'utf8'),
    ) as { version: string }
    expect(MCP_SERVER_VERSION).toBe(manifest.version)
  })

  it('quotes SYSTEM_PROMPT_TOOL_DESCRIPTION in the README fence', () => {
    const readme = readFileSync(join(repoRoot, 'packages/cursor/mcp-server/README.md'), 'utf8')
    expect(readme).toContain(SYSTEM_PROMPT_TOOL_DESCRIPTION)
  })
})
