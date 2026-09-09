/**
 * Live model-invocable skill catalog for MCP initialize / `dsh_system_prompt`.
 * Native DSH publishes the same entries at `agent/pre-step`; Cursor never sees that transcript.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { isModelInvocable } from '@deepseek-ai/dsh-skill'
import { toSkillCatalogEntries, type SkillCatalogEntry } from '@deepseek-ai/dsh-tool-skill'

const lastGoodByAgent = new WeakMap<Agent, readonly SkillCatalogEntry[]>()

/**
 * Snapshot model-invocable skills for the MCP extra-tool projection.
 * Incomplete discovery keeps the last complete list for that owner Agent.
 * Missing `ctx.skills` or a hidden `dsh_skill` tool yields an empty catalog.
 * @param ctx - plugin context; `skills` is optional.
 * @param agent - MCP owner Agent; omitted reads the global skill layer with no last-good cache.
 * @param signal - forwarded to `ctx.skills.snapshot`.
 * @returns durable catalog entries (normalized, unescaped).
 */
export async function resolveMcpSkillCatalog(
  ctx: Context,
  agent: Agent | undefined,
  signal: AbortSignal,
): Promise<readonly SkillCatalogEntry[]> {
  const lastGood = agent === undefined ? [] : lastGoodByAgent.get(agent) ?? []
  const skills = ctx.get('skills')
  if (skills === undefined || ctx.tools.get('dsh_skill', agent) === undefined) {
    if (agent !== undefined) lastGoodByAgent.set(agent, [])
    return []
  }
  const snapshot = await skills.snapshot({
    cwd: agent?.session.header.cwd,
    signal,
    scope: agent,
  })
  if (!snapshot.complete) return lastGood
  const entries = toSkillCatalogEntries(snapshot.skills.filter(isModelInvocable))
  if (agent !== undefined) lastGoodByAgent.set(agent, entries)
  return entries
}
