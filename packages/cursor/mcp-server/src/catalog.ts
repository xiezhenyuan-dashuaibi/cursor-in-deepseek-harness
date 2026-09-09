/**
 * MCP tool catalog: omit Cursor-overlapping `dsh_*` names, the DSH
 * subagent control plane, and DSH LLM-child tools; keep every other live
 * `ctx.tools` schema; always advertise `dsh_system_prompt`.
 */

import { MCP_OMITTED_TOOL_NAMES } from '@deepseek-ai/dsh-cursor-mcp-prompt'
import type { ToolSchema } from '@deepseek-ai/dsh-llm'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'

const OMITTED = new Set<string>(MCP_OMITTED_TOOL_NAMES)

/** MCP tool name that returns `renderMcpSystemPrompt()` with the live skill catalog. */
export const SYSTEM_PROMPT_TOOL_NAME = 'dsh_system_prompt'

/**
 * Model-facing description of {@link SYSTEM_PROMPT_TOOL_NAME}.
 * The returned markdown is owned by `@deepseek-ai/dsh-cursor-mcp-prompt`.
 */
export const SYSTEM_PROMPT_TOOL_DESCRIPTION =
  'Return DeepSeek Harness extra-capability instructions for this MCP server. Call this when you have never read those instructions, or after compaction dropped them. Do not wait for the server to guess you forgot.'

/**
 * Whether `name` is on the MCP omit list (Cursor-owned clones, the DSH subagent control plane, or DSH LLM-child tools).
 * @param name - model-facing tool name (`dsh_*` on the wire).
 * @returns true when the MCP catalog must hide the name and refuse to execute it.
 */
export function isOmittedMcpToolName(name: string): boolean {
  return OMITTED.has(name)
}

/**
 * Project a DSH JSON Schema object onto MCP `inputSchema` (`type: "object"`).
 * @param parameters - `ToolSchema.parameters` from `ctx.tools.schemas()`.
 * @returns an MCP object schema; a non-object record is wrapped as `properties`.
 */
export function toMcpInputSchema(parameters: Record<string, unknown>): Tool['inputSchema'] {
  if (parameters.type === 'object') return parameters as Tool['inputSchema']
  return { type: 'object', properties: parameters as Record<string, object> }
}

/**
 * Build the MCP tool list: `dsh_system_prompt` first, then live schemas minus the omit list.
 * @param schemas - `ctx.tools.schemas()` (or the owner Agent view).
 * @returns MCP `tools/list` entries. Omitted LLM-child and subagent-control names are not this catalog.
 */
export function listMcpTools(schemas: ToolSchema[]): Tool[] {
  const extras = schemas
    .filter(schema => !isOmittedMcpToolName(schema.name) && schema.name !== SYSTEM_PROMPT_TOOL_NAME)
    .map((schema): Tool => ({
      name: schema.name,
      description: schema.description,
      inputSchema: toMcpInputSchema(schema.parameters),
    }))
  return [
    {
      name: SYSTEM_PROMPT_TOOL_NAME,
      description: SYSTEM_PROMPT_TOOL_DESCRIPTION,
      inputSchema: { type: 'object', properties: {} },
    },
    ...extras,
  ]
}
