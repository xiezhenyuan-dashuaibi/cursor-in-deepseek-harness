import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const PATCH_PATH = join(dirname(fileURLToPath(import.meta.url)), '../cordis.patch.yml')

/** Unused `dsh-base` rows the stdio profile must not activate (Cursor ~30s initialize). */
const DISABLED_IDS = [
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

describe('cursor-mcp cordis.patch.yml', () => {
  it('disables unused dsh-base rows and keeps the MCP insert', () => {
    const text = readFileSync(PATCH_PATH, 'utf8')
    expect(text).toContain("name: '@deepseek-ai/dsh-cursor-mcp-server'")
    expect(text).not.toMatch(/^- id: pwsh-sandbox\r?\n  disabled: true/m)
    for (const id of DISABLED_IDS) {
      expect(text, id).toMatch(new RegExp(`^- id: ${id}\\r?\\n  disabled: true`, 'm'))
    }
  })
})
