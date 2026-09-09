/**
 * MCP-facing system-prompt projection: DSH-unique extra-tool rules.
 * Native `ctx.systemPrompt.assemble()` is unchanged; Cursor already owns
 * file, shell, search, todo, web, plan, goals, and subagents. This-checkout
 * identity lives in `.cursor/rules/`, not here.
 */

import {
  renderSkillCatalogLines,
  SKILL_CATALOG_EMPTY,
  SKILL_CATALOG_INTRO,
  SKILL_CATALOG_LOAD_GUIDANCE,
  type SkillCatalogEntry,
} from '@deepseek-ai/dsh-tool-skill'

/** Catalog row type owned by `@deepseek-ai/dsh-tool-skill`. */
export type { SkillCatalogEntry }

/** Options for {@link renderMcpSystemPrompt}. */
export interface RenderMcpSystemPromptOptions {
  /**
   * Model-invocable catalog entries (normalized, unescaped).
   * Omitted or empty states that no skills are available through `dsh_skill`.
   */
  readonly skillCatalog?: readonly SkillCatalogEntry[]
}

/** Standard-preset extra tools this projection describes. */
export const MCP_TOOL_NAMES = [
  'dsh_skill',
] as const

/**
 * Spawn, query, message, interrupt, and job-board tools that only make sense
 * with DSH subagents on the catalog. Cursor Task owns parent-side delegation,
 * so this whole control plane is omitted together.
 */
export const MCP_SUBAGENT_CONTROL_PLANE = [
  'dsh_job_list',
  'dsh_job_output',
  'dsh_job_kill',
  'dsh_subagent',
  'dsh_subagent_fork',
  'dsh_send_message',
  'dsh_interrupt_agent',
  'dsh_list_agents',
] as const

/**
 * Tools whose children call the DSH LLM (DeepSeek credentials in this process).
 * Cursor-hosted MCP does not use that model; Cursor Task and goals cover fan-out
 * and iteration. Native headless, ACP, and web still register these names.
 */
export const MCP_DSH_LLM_CHILD_TOOLS = [
  'dsh_workflow',
  'dsh_ralph',
] as const

/**
 * Tool names omitted from MCP: Cursor-owned clones, {@link MCP_SUBAGENT_CONTROL_PLANE},
 * and {@link MCP_DSH_LLM_CHILD_TOOLS}.
 */
export const MCP_OMITTED_TOOL_NAMES = [
  'dsh_read',
  'dsh_write',
  'dsh_edit',
  'dsh_read_image',
  'dsh_glob',
  'dsh_grep',
  'dsh_bash',
  'dsh_pwsh',
  'dsh_todo_write',
  'dsh_ask_user_question',
  'dsh_web_search',
  'dsh_web_fetch',
  'dsh_exit_plan_mode',
  'dsh_get_goal',
  'dsh_create_goal',
  'dsh_update_goal',
  ...MCP_SUBAGENT_CONTROL_PLANE,
  ...MCP_DSH_LLM_CHILD_TOOLS,
] as const

/** MCP-only opener: this server is DSH extras; Cursor already has the rest. */
export const MCP_PREAMBLE =
  'This MCP server exposes DeepSeek Harness extras to Cursor (initialize name `dsh`): skills. Call them with JSON arguments that match each tool schema. Names on the wire are `dsh_*`; the client may add a server prefix — still call the MCP tool, not a Cursor built-in with a similar name. Do not call DeepSeek Harness clones of file, shell, search, todo, web, plan, goals, or subagents — use Cursor\'s own tools for those.\n\n'
  + 'If compaction drops these extra-tool instructions, call `dsh_system_prompt` with no arguments and continue from that markdown.'

/* jscpd:ignore-start */
/** Exact `dsh_skill` ToolSchema.description. */
export const MCP_SKILL_GUIDANCE =
  'Load the full instructions for an available skill. Call this with the exact skill name from the session skill catalog before acting on a task that names or clearly matches that skill.'
/* jscpd:ignore-end */

/**
 * MCP-only: DSH still enforces sandbox and approval on these calls.
 * Omitted wire names must not appear as substrings.
 */
export const MCP_EXECUTION_POLICY =
  'DeepSeek Harness still enforces its file sandbox and approval policy on these MCP calls. A denial or escalation is the tool result; follow that result. Do not reroute a denied extra-tool write through Cursor\'s file or shell tools to bypass it. If a write or mutating shell is denied, stop; do not get around it with git apply, patch, python, or by editing a preload or hook.'

/**
 * Render the Skills section: live `<available_skills>` entries, or an empty catalog.
 * @param skillCatalog - model-invocable entries; empty omits names.
 * @returns markdown including the `## Skills` heading.
 */
function renderMcpSkillsSection(skillCatalog: readonly SkillCatalogEntry[]): string {
  if (skillCatalog.length === 0) {
    return ['## Skills', SKILL_CATALOG_EMPTY].join('\n\n')
  }
  return [
    '## Skills',
    [
      SKILL_CATALOG_INTRO,
      '',
      '<available_skills>',
      ...renderSkillCatalogLines(skillCatalog),
      '</available_skills>',
      '',
      SKILL_CATALOG_LOAD_GUIDANCE,
    ].join('\n'),
  ].join('\n\n')
}

/**
 * Render the MCP system-prompt projection.
 * @param options - optional live skill catalog from the MCP owner Agent's registry.
 * @returns markdown the MCP `dsh_system_prompt` tool (or initialize instructions) returns.
 */
export function renderMcpSystemPrompt(options?: RenderMcpSystemPromptOptions): string {
  return [
    MCP_PREAMBLE,
    'These extra tools are on this MCP server:\n\n'
    + MCP_TOOL_NAMES.map(toolName => `- \`${toolName}\``).join('\n'),
    renderMcpSkillsSection(options?.skillCatalog ?? []),
    '## Execution policy',
    MCP_EXECUTION_POLICY,
  ].join('\n\n')
}
