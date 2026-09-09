import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  commandLooksLikeMutation,
  decide,
  isProtectedRelative,
  parseHookStdin,
  toRepoRelative,
} from './protect-spine.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..')
const script = join(here, 'protect-spine.mjs')

describe('isProtectedRelative', () => {
  it('denies the spine prefixes and the hook files', () => {
    assert.equal(isProtectedRelative('packages/core/agent-loop/src/index.ts'), true)
    assert.equal(isProtectedRelative('packages/core'), true)
    assert.equal(isProtectedRelative('vendor/cordis/src/index.ts'), true)
    assert.equal(isProtectedRelative('packages/boot/app-boot/src/index.ts'), true)
    assert.equal(isProtectedRelative('native/landlock-run/README.md'), true)
    assert.equal(isProtectedRelative('.cursor/hooks.json'), true)
    assert.equal(isProtectedRelative('.cursor/hooks/protect-spine.mjs'), true)
  })

  it('allows Cursor-version and other product trees', () => {
    assert.equal(isProtectedRelative('packages/cursor/mcp-server/src/index.ts'), false)
    assert.equal(isProtectedRelative('packages/client/ui-cursor-agent/src/client/index.ts'), false)
    assert.equal(isProtectedRelative('packages/bundle/web-app/cordis.patch.yml'), false)
    assert.equal(isProtectedRelative('packages/llm/llm/src/index.ts'), false)
    assert.equal(isProtectedRelative('AGENTS.md'), false)
  })
})

describe('decide', () => {
  it('denies Write/StrReplace/Delete under the spine', () => {
    for (const tool_name of ['Write', 'StrReplace', 'Delete']) {
      const result = decide({
        tool_name,
        tool_input: { path: join(repoRoot, 'packages/core/session/src/index.ts') },
        cwd: repoRoot,
      }, repoRoot)
      assert.equal(result.permission, 'deny')
    }
  })

  it('allows Write under packages/cursor', () => {
    const result = decide({
      tool_name: 'Write',
      tool_input: { path: 'packages/cursor/mcp-server/src/index.ts' },
      cwd: repoRoot,
    }, repoRoot)
    assert.equal(result.permission, 'allow')
  })

  it('allows Read of spine sources', () => {
    const result = decide({
      tool_name: 'Read',
      tool_input: { path: 'packages/core/agent-loop/src/index.ts' },
      cwd: repoRoot,
    }, repoRoot)
    assert.equal(result.permission, 'allow')
  })

  it('denies a mutating shell that names a spine path', () => {
    const result = decide({
      command: 'Set-Content -Path packages/core/agent-loop/src/index.ts -Value x',
      cwd: repoRoot,
    }, repoRoot)
    assert.equal(result.permission, 'deny')
  })

  it('denies redirection onto a spine path', () => {
    const result = decide({
      command: 'echo hi > packages/core/x.ts',
      cwd: repoRoot,
    }, repoRoot)
    assert.equal(result.permission, 'deny')
  })

  it('allows rg and pnpm test against packages/core', () => {
    assert.equal(decide({ command: 'rg Fiber packages/core/agent-loop' }, repoRoot).permission, 'allow')
    assert.equal(decide({
      command: 'pnpm --filter @deepseek-ai/dsh-agent-loop test',
    }, repoRoot).permission, 'allow')
  })

  it('allows a shell with no spine path', () => {
    assert.equal(decide({ command: 'git status' }, repoRoot).permission, 'allow')
  })
})

describe('helpers', () => {
  it('maps workspace-relative and absolute paths onto the repo', () => {
    assert.equal(toRepoRelative('packages/core/x.ts', repoRoot), 'packages/core/x.ts')
    assert.equal(
      toRepoRelative(join(repoRoot, 'vendor', 'cordis', 'src', 'index.ts'), repoRoot),
      'vendor/cordis/src/index.ts',
    )
    assert.equal(toRepoRelative(join(repoRoot, '..', 'outside-dsh.txt'), repoRoot), undefined)
  })

  it('detects mutation without flagging a bare rg', () => {
    assert.equal(commandLooksLikeMutation('rg foo packages/core'), false)
    assert.equal(commandLooksLikeMutation('rm packages/core/x.ts'), true)
  })

  it('strips a UTF-8 BOM before JSON.parse', () => {
    const parsed = parseHookStdin('\uFEFF{"tool_name":"Write","tool_input":{"path":"a.ts"}}')
    assert.equal(parsed.tool_name, 'Write')
  })
})

describe('cli', () => {
  it('prints deny JSON for a spine Write on stdin', () => {
    const payload = JSON.stringify({
      tool_name: 'Write',
      tool_input: { path: 'packages/boot/app-boot/src/index.ts' },
      cwd: repoRoot,
    })
    const result = spawnSync(process.execPath, [script], {
      input: payload,
      encoding: 'utf8',
      cwd: repoRoot,
    })
    assert.equal(result.status, 0)
    assert.equal(JSON.parse(result.stdout).permission, 'deny')
  })
})
