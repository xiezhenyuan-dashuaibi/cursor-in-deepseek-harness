import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const DISABLED_UNUSED_BASE_ROWS = [
  'hmr',
  'session-title',
  'session-title-llm',
  'typert',
  'typert-loader',
  'typert-gateway',
  'user-questions',
  'llm-pi-ai',
  'attachment-local',
  'session-query-sqlite',
  'session-telemetry-otel',
  'tool-jobs',
  'tool-fs',
  'tool-fs-search',
  'commands',
  'command-feedback',
  'goal',
  'goal-round-driver',
  'command-goal',
  'plan-mode',
  'token-meter',
  'compaction-basic',
  'command-compact',
  'subagent',
  'subagent-spawn-in-process',
  'subagent-fork-in-process',
  'tool-subagent-control',
  'tool-subagent-list-agents',
  'tool-subagent',
  'tool-subagent-fork',
  'tool-subagent-report',
  'workflow-worker-thread',
  'tool-workflow',
  'spill-local',
  'spill-policy',
  'session-checkpoint-policy',
  'tool-result-pruner',
  'tool-todo',
  'tool-goal',
  'tool-ralph',
  'repeat-tool-reminder',
  'web',
  'web-search-deepseek',
  'tool-web',
] as const

describe('cursor-mcp bundle patch', () => {
  it('disables unused dsh-base rows and does not disable the Windows shell provider', () => {
    const text = readFileSync(
      resolve(fileURLToPath(new URL('..', import.meta.url)), 'cordis.patch.yml'),
      'utf8',
    )
    for (const id of DISABLED_UNUSED_BASE_ROWS) {
      expect(text, id).toMatch(new RegExp(`^- id: ${id}\\r?\\n  disabled: true`, 'm'))
    }
    expect(text).not.toMatch(/^- id: pwsh-sandbox$/m)
    expect(text).toMatch(/^- id: cursor-mcp-server$/m)
    expect(text).toMatch(/^- id: cursor-mcp-prompt$/m)
  })
})
