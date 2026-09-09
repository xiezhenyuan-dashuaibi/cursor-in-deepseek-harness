/**
 * MCP-facing DeepSeek Harness system-prompt projection.
 * Native `ctx.systemPrompt.assemble()` is unchanged.
 */

export {
  MCP_DSH_LLM_CHILD_TOOLS,
  MCP_EXECUTION_POLICY,
  MCP_OMITTED_TOOL_NAMES,
  MCP_PREAMBLE,
  MCP_SKILL_GUIDANCE,
  MCP_SUBAGENT_CONTROL_PLANE,
  MCP_TOOL_NAMES,
  renderMcpSystemPrompt,
} from './prompt.ts'
export type { RenderMcpSystemPromptOptions, SkillCatalogEntry } from './prompt.ts'

/** Stable Cordis plugin name. */
export const name = 'cursor-mcp-prompt'

/** No services: the MCP server imports {@link renderMcpSystemPrompt} directly. */
export const inject = []

/** Host loader seat so `cursor-mcp` compositions can name this package as a row. */
export function apply(): void {}
