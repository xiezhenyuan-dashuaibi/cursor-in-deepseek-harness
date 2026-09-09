/**
 * Guarantee tests for the tool-schema catalog generator (`scripts/gen-tool-catalog.ts`).
 */

import { describe, expect, it } from 'vitest'
import {
  assertManifestComplete,
  assertShippedModelToolName,
  assertToolsHarvested,
  collectToolCatalog,
  render,
  type ToolCatalog,
  type ToolPackage,
} from '../../../../scripts/gen-tool-catalog.ts'

/** JSON Schema shape enough to reach the values AST extraction can't. */
interface JsonSchema {
  type: string
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  enum?: string[]
  required?: string[]
}

describe('gen-tool-catalog collectToolCatalog', () => {
  it('boots every shipped tool package and harvests its model-facing schemas', async () => {
    const catalog = await collectToolCatalog()
    const names = catalog.flatMap(entry => entry.schemas.map(s => s.name)).sort()
    expect(names).toEqual(['dsh_ask_user_question', 'dsh_bash', 'dsh_bash', 'dsh_cordis_define', 'dsh_cordis_inspect_list', 'dsh_cordis_inspect_query', 'dsh_cordis_inspect_self', 'dsh_cordis_run', 'dsh_cordis_stop', 'dsh_cordis_undefine', 'dsh_create_goal', 'dsh_edit', 'dsh_exit_plan_mode', 'dsh_get_goal', 'dsh_glob', 'dsh_grep', 'dsh_interrupt_agent', 'dsh_job_kill', 'dsh_job_list', 'dsh_job_output', 'dsh_list_agents', 'dsh_lsp', 'dsh_pwsh', 'dsh_ralph', 'dsh_read', 'dsh_read_image', 'dsh_report', 'dsh_run_code', 'dsh_schedule_create', 'dsh_schedule_delete', 'dsh_schedule_list', 'dsh_send_message', 'dsh_session_event_read', 'dsh_session_event_search', 'dsh_session_event_trace', 'dsh_session_search', 'dsh_session_trace', 'dsh_skill', 'dsh_str_replace_editor', 'dsh_subagent', 'dsh_terminal_close', 'dsh_terminal_list', 'dsh_terminal_open', 'dsh_terminal_read', 'dsh_terminal_send', 'dsh_terminal_signal', 'dsh_todo_write', 'dsh_update_goal', 'dsh_web_fetch', 'dsh_web_search', 'dsh_workflow', 'dsh_write'])
    // Every tool carries a JSON-Schema `parameters` object (what the model sees).
    for (const entry of catalog) {
      for (const schema of entry.schemas) {
        expect((schema.parameters as unknown as JsonSchema).type).toBe('object')
      }
    }
  })

  it('resolves a runtime-spread enum to its literal members (the payoff over AST)', async () => {
    const catalog = await collectToolCatalog()
    const todo = catalog
      .flatMap(entry => entry.schemas)
      .find(s => s.name === 'dsh_todo_write')
    // `todo-todo` writes `enum: [...STATUSES]` — a source AST would see the
    // spread, not the values. Booting yields the shipped enum literals.
    const status = (((todo?.parameters as unknown as JsonSchema).properties?.todos)?.items)?.properties?.status
    expect(status?.enum).toEqual(['pending', 'in_progress', 'completed'])
  })

  it('attributes each harvested tool with its registering plugin source', async () => {
    const catalog = await collectToolCatalog()
    const bash = catalog.find(entry => entry.pkg === '@deepseek-ai/dsh-tool-bash')
    expect(bash?.sources.dsh_bash).toBe('packages/shell/tool-bash/src/index.ts')
    const control = catalog.find(entry => entry.pkg === '@deepseek-ai/dsh-tool-subagent-control')
    expect(control?.sources).toEqual({
      dsh_interrupt_agent: 'packages/subagent/tool-subagent-control/src/index.ts',
      dsh_list_agents: 'packages/subagent/tool-subagent-control/src/list-agents.ts',
      dsh_send_message: 'packages/subagent/tool-subagent-control/src/index.ts',
    })
  })

  it('harvests search tools without depending on the generator process PATH', async () => {
    const oldPath = process.env.PATH
    try {
      process.env.PATH = ''
      const catalog = await collectToolCatalog()
      const search = catalog.find(entry => entry.pkg === '@deepseek-ai/dsh-tool-fs-search')
      expect(search?.schemas.map(s => s.name).sort()).toEqual(['dsh_glob', 'dsh_grep'])
    } finally {
      if (oldPath === undefined) delete process.env.PATH
      else process.env.PATH = oldPath
    }
  })

  it('records the shipped `dsh_subagent_fork` alias in a note (config-driven tool name)', async () => {
    // `tool-subagent`'s registered name is the load-time `toolName` config, so the shipped
    // agents surface this one package as both `dsh_subagent` and `dsh_subagent_fork`.
    const catalog = await collectToolCatalog()
    const subagent = catalog.find(entry => entry.pkg === '@deepseek-ai/dsh-tool-subagent')
    expect(subagent?.schemas.map(s => s.name)).toEqual(['dsh_subagent'])
    expect(subagent?.note).toMatch(/dsh_subagent_fork/)
  })
})

describe('gen-tool-catalog assertManifestComplete', () => {
  it('passes when the manifest lists every on-disk tool package (the default)', () => {
    expect(() => { assertManifestComplete() }).not.toThrow()
  })

  it('throws, naming the omitted package, when a tool package is missing from the manifest', () => {
    // An empty manifest scanned against the real tree: every `tool-*` package
    // is unlisted, so the guard must fire and name them.
    expect(() => { assertManifestComplete([]) }).toThrow(/not in the boot manifest/)
    expect(() => { assertManifestComplete([]) }).toThrow(/tool-bash/)
  })
})

describe('gen-tool-catalog assertShippedModelToolName', () => {
  it('accepts a dsh_* harvested name', () => {
    expect(() => { assertShippedModelToolName('@deepseek-ai/dsh-tool-demo', 'dsh_read') }).not.toThrow()
  })

  it('rejects a harvested name that is not dsh_*', () => {
    expect(() => { assertShippedModelToolName('@deepseek-ai/dsh-tool-demo', 'read') })
      .toThrow(/is not a dsh_\* model-facing name/)
  })
})

describe('gen-tool-catalog assertToolsHarvested', () => {
  const entry: ToolPackage = {
    pkg: '@deepseek-ai/dsh-tool-demo',
    dir: 'tool-demo',
    source: 'packages/demo/tool-demo/src/index.ts',
    requires: ['ctx.tools', 'ctx.somethingUnmounted'],
    writes: ['tool/result'],
    mount: () => Promise.resolve(),
  }

  it('accepts a boot that registered at least one tool', () => {
    expect(() => { assertToolsHarvested(entry, 1) }).not.toThrow()
  })

  it('throws, naming the package and its requirements, when a boot registers nothing', () => {
    // The failure this guards is silent by construction: the package is in the
    // manifest, its plugin merely stays PENDING on an unmounted service, and the
    // catalog would ship without its tools while every gate stays green.
    expect(() => { assertToolsHarvested(entry, 0) }).toThrow(/@deepseek-ai\/dsh-tool-demo booted without registering a single tool/)
    expect(() => { assertToolsHarvested(entry, 0) }).toThrow(/ctx.somethingUnmounted/)
  })
})

describe('gen-tool-catalog render', () => {
  it('emits a package heading, a tool heading, and a json schema fence', () => {
    const catalog: ToolCatalog = [
      {
        pkg: '@deepseek-ai/dsh-tool-demo',
        sources: { demo: 'packages/demo/tool-demo/src/index.ts' },
        requires: ['ctx.tools'],
        writes: ['tool/result'],
        schemas: [{ name: 'demo', description: 'A demo tool.', parameters: { type: 'object', properties: {} } }],
      },
    ]
    const md = render(catalog)
    expect(md).toContain('| `@deepseek-ai/dsh-tool-demo` | `demo` | `ctx.tools` | `tool/result` |')
    expect(md).toContain('## `@deepseek-ai/dsh-tool-demo`')
    expect(md).toContain('### `demo`')
    expect(md).toContain('A demo tool.')
    expect(md).toContain('```json')
    expect(md).toContain('Source: [`packages/demo/tool-demo/src/index.ts`]')
  })
})
