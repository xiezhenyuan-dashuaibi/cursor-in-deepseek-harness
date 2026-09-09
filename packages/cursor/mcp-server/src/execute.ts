/**
 * MCP `tools/call` → `ctx.tools.execute()`, plus the no-arg system-prompt tool.
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { renderMcpSystemPrompt } from '@deepseek-ai/dsh-cursor-mcp-prompt'
import { CallId, type ContentBlock } from '@deepseek-ai/dsh-llm'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type { CallToolResult, TextContent } from '@modelcontextprotocol/sdk/types.js'
import { isOmittedMcpToolName, SYSTEM_PROMPT_TOOL_NAME } from './catalog.ts'
import { resolveMcpSkillCatalog } from './skill-catalog.ts'

/** One MCP `tools/call` after JSON-RPC decode. */
export interface McpCallInput {
  /** Wire tool name (`dsh_*`; Cursor may prefix on its side). */
  name: string
  /** JSON arguments; a non-object becomes `{}`. */
  arguments: unknown
  /** Cancellation forwarded to `ctx.tools.execute`. */
  signal: AbortSignal
  /** Owner Agent so extra-tool execute shares one DSH session. */
  agent?: Agent
}

/**
 * Accept MCP JSON tool arguments. A missing or non-object value becomes `{}`.
 * @param value - `tools/call` `arguments`.
 * @returns a plain object for `ctx.tools.execute`.
 */
export function jsonToolArguments(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

/**
 * Map one DSH content block to MCP text. Image and unknown tags stay placeholders.
 * @param block - a model-facing content block (merge-extensible).
 * @returns one MCP text block.
 */
export function contentBlockToMcpText(block: ContentBlock): TextContent {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text }
    case 'reasoning':
      return { type: 'text', text: block.text }
    case 'image':
      return { type: 'text', text: '[image]' }
    case 'tool-call':
    case 'tool-result':
      return { type: 'text', text: JSON.stringify(block) }
    default:
      return { type: 'text', text: JSON.stringify(block) }
  }
}

/**
 * Project a DSH tool result onto MCP `CallToolResult`.
 * @param result - materialized `ctx.tools.execute` outcome.
 * @returns MCP content plus `isError` when the DSH call failed.
 */
export function mapToolResult(result: ToolExecutionResult): CallToolResult {
  const content = result.content.map(contentBlockToMcpText)
  return {
    content: content.length > 0 ? content : [{ type: 'text', text: '(no output)' }],
    ...result.isError ? { isError: true as const } : {},
  }
}

/**
 * Serve one MCP tool call. Omitted names fail without reaching `ctx.tools.execute`.
 * @param ctx - plugin context carrying `ctx.tools`.
 * @param input - wire name, JSON arguments, cancellation, and optional owner Agent.
 * @returns MCP result; `dsh_system_prompt` returns {@link renderMcpSystemPrompt} with the live skill catalog.
 */
export async function executeMcpCall(ctx: Context, input: McpCallInput): Promise<CallToolResult> {
  if (input.name === SYSTEM_PROMPT_TOOL_NAME) {
    const skillCatalog = await resolveMcpSkillCatalog(ctx, input.agent, input.signal)
    return { content: [{ type: 'text', text: renderMcpSystemPrompt({ skillCatalog }) }] }
  }
  if (isOmittedMcpToolName(input.name)) {
    return {
      content: [{ type: 'text', text: `MCP omits "${input.name}"; use Cursor's own tool.` }],
      isError: true,
    }
  }
  const result = await ctx.tools.execute({
    callId: CallId(`mcp-${randomUUID()}`),
    name: input.name,
    arguments: jsonToolArguments(input.arguments),
    signal: input.signal,
    ...input.agent !== undefined ? { agent: input.agent } : {},
  })
  return mapToolResult(result)
}
