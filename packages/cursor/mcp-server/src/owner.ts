/**
 * One MCP-owned Agent so extra-tool execute shares a DSH session.
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type { AgentHandle, ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Config } from './index.ts'

/**
 * Create the Agent that MCP `tools/call` runs as.
 * Production `apply` awaits Loader settlement first so sibling tools exist.
 * @param ctx - plugin context carrying `ctx.agents` (and optionally `agentDefaultModel`).
 * @param config - validated plugin config (`cwd` empty uses `process.cwd()`).
 * @returns the live handle; dispose it when the MCP server closes.
 */
export async function createOwnerAgent(ctx: Context, config: Config): Promise<AgentHandle> {
  const cwd = config.cwd.length > 0 ? config.cwd : process.cwd()
  const selection = ctx.get('agentDefaultModel')?.currentSelection()
  const handle = await ctx.agents.create({
    sessionId: SessionId(`mcp-${randomUUID()}`),
    meta: { cwd },
    ...selection !== undefined
      ? {
        agentOptions: { provider: selection.provider, model: selection.model },
        setup: (agentCtx) => {
          const selected: ModelSelectionRef = { current: selection, assembled: undefined }
          installModelSelection(agentCtx, selected)
        },
      }
      : {},
  })
  await handle.agent.whenIdle()
  return handle
}
