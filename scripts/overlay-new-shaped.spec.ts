import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parsePageName } from './overlay-new-page.ts'
import { runOverlayNewShaped } from './overlay-new-shaped.ts'
import { slotIdFromLocale } from './overlay-new-shaped-files.ts'

const temps: string[] = []

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-overlay-new-shaped-'))
  temps.push(dir)
  return dir
}

function seedRepo(withLanding = false): string {
  const root = tempDir()
  mkdirSync(join(root, 'packages', 'bundle', 'web-app', 'tests'), { recursive: true })
  mkdirSync(join(root, 'packages', 'client'), { recursive: true })
  mkdirSync(join(root, 'scripts'), { recursive: true })
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({ name: '@deepseek-ai/dsh-root', version: '0.1.0-test' }, null, 2)}\n`)
  writeFileSync(join(root, 'packages', 'bundle', 'web-app', 'cordis.patch.yml'), 'sentinel: keep\n')
  if (withLanding) {
    writeFileSync(
      join(root, 'tsconfig.client.json'),
      '{ "references": [\n    { "path": "./packages/client/ui-overlay-shaped/tsconfig.client.json" },\n    { "path": "./packages/client/ui-tool" }\n  ] }\n',
    )
    writeFileSync(
      join(root, 'tsconfig.base.json'),
      '{ "compilerOptions": { "paths": {\n      "@deepseek-ai/dsh-client-ui-overlay-shaped": ["./packages/client/ui-overlay-shaped/src"],\n    } } }\n',
    )
    writeFileSync(
      join(root, 'packages', 'client', 'README.md'),
      '| [`ui-overlay-shaped/`](ui-overlay-shaped/README.md) | Canonical reusable overlay shaped board on `shell.overlay`; insert this package, then occupy `overlay-shaped.body` (many occupants at once). |\n| [`ui-tool/`](ui-tool/README.md) | Tools. |\n',
    )
    writeFileSync(
      join(root, 'packages', 'client', 'README.zh.md'),
      '| [`ui-overlay-shaped/`](ui-overlay-shaped/README.md) | 规范的可复用 overlay 异形基模，占据 `shell.overlay`；插入本包后再占据 `overlay-shaped.body`（可同时多个占用者）。 |\n| [`ui-tool/`](ui-tool/README.md) | 工具。 |\n',
    )
    writeFileSync(
      join(root, 'scripts', 'verify-package-readme-model-experience.ts'),
      '  \'packages/client/ui-overlay-shaped\': { kind: \'none\', reason: \'Reusable overlay shaped board; registers nothing model-facing.\' },\n',
    )
    writeFileSync(
      join(root, 'packages', 'bundle', 'web-app', 'tests', 'lab-overlay-occupants.spec.ts'),
      'const OMITTED_IDS = [\'ui-lab\'] as const\nconst OMITTED_PACKAGES = [\n  \'@deepseek-ai/dsh-client-ui-lab\',\n] as const\n',
    )
  }
  return root
}

describe('overlay-new-shaped', () => {
  it('parses names through overlay-new-shaped errors', () => {
    expect(parsePageName('notes', 'overlay-new-shaped')).toEqual({
      dirName: 'notes',
      npmName: '@deepseek-ai/dsh-client-notes',
      localeNs: 'overlay-notes',
    })
    expect(slotIdFromLocale('overlay-notes')).toBe('notes')
    expect(() => parsePageName('', 'overlay-new-shaped')).toThrow(/overlay-new-shaped: name is required/)
  })

  it('refuses usage without a name and a missing root version', () => {
    const root = seedRepo()
    expect(() => runOverlayNewShaped([], { repoRoot: root })).toThrow(/usage/)
    writeFileSync(join(root, 'package.json'), `${JSON.stringify({ name: '@deepseek-ai/dsh-root' }, null, 2)}\n`)
    expect(() => runOverlayNewShaped(['ui-notes'], { repoRoot: root })).toThrow(/missing version/)
  })

  it('writes the shaped kit and does not touch the web-app bundle patch', () => {
    const root = seedRepo()
    const message = runOverlayNewShaped(['ui-notes'], { repoRoot: root })
    expect(message).toContain('packages/client/ui-notes')
    expect(message).toContain('ui-overlay-shaped')
    const dest = join(root, 'packages', 'client', 'ui-notes')
    const pkg = JSON.parse(readFileSync(join(dest, 'package.json'), 'utf8')) as {
      name: string
      version: string
      scripts?: Record<string, string>
      dsh: { client: { inject: string[]; overlayBody?: string } }
    }
    expect(pkg.name).toBe('@deepseek-ai/dsh-client-ui-notes')
    expect(pkg.version).toBe('0.1.0-test')
    expect(pkg.dsh.client.inject).toContain('@deepseek-ai/dsh-client-ui-overlay-shaped')
    expect(pkg.dsh.client.overlayBody).toBe('overlay-shaped.body')
    const client = readFileSync(join(dest, 'src', 'client', 'index.ts'), 'utf8')
    expect(client).toContain("name: 'overlay-shaped.body'")
    expect(client).toContain("id: 'notes'")
    expect(client).not.toContain('preferFrame')
    expect(client).not.toContain("name: 'shell.overlay'")
    const occupant = readFileSync(join(dest, 'src', 'client', 'Occupant.tsx'), 'utf8')
    expect(occupant).not.toContain('preferFrame')
    expect(occupant).toContain('onClick')
    expect(occupant).not.toContain('setPointerCapture')
    expect(readFileSync(join(dest, 'src', 'client', 'Occupant.module.css'), 'utf8')).toContain(
      'flex-shrink: 0',
    )
    expect(readFileSync(join(dest, 'tsconfig.json'), 'utf8')).toContain('ui-overlay-shaped/tsconfig.client.json')
    expect(pkg.scripts).toEqual({
      build: 'tsc --pretty false -p tsconfig.json && tsdown',
      bundle: 'tsdown',
      watch: 'tsdown --watch',
    })
    expect(message).toContain('pnpm overlay:live insert packages/client/ui-overlay-shaped')
    expect(message).toContain('Occupant.tsx')
    expect(message).not.toContain('bundle')
    expect(readFileSync(join(dest, 'src', 'client', 'locales.ts'), 'utf8')).toContain('Keep this export name')
    expect(readFileSync(join(dest, 'src', 'client', 'locales.ts'), 'utf8')).toContain('OverlayShapedKey')
    expect(readFileSync(join(dest, 'tests', 'browser-plugin.client.spec.ts'), 'utf8')).toContain('overlay-shaped.body')
    expect(readFileSync(join(dest, 'README.md'), 'utf8')).toContain('dsh-overlay-shaped-plugins/SKILL.md')
    expect(readFileSync(join(root, 'packages', 'bundle', 'web-app', 'cordis.patch.yml'), 'utf8')).toBe('sentinel: keep\n')
  })

  it('lands inventory, tsconfig, and omit rows without touching the bundle patch', () => {
    const root = seedRepo(true)
    runOverlayNewShaped(['ui-notes'], { repoRoot: root })
    expect(readFileSync(join(root, 'tsconfig.client.json'), 'utf8')).toContain(
      './packages/client/ui-notes',
    )
    expect(readFileSync(join(root, 'packages', 'client', 'README.md'), 'utf8')).toContain(
      'overlay-shaped.body',
    )
    expect(readFileSync(join(root, 'scripts', 'verify-package-readme-model-experience.ts'), 'utf8'))
      .toContain("'packages/client/ui-notes'")
    const omit = readFileSync(
      join(root, 'packages', 'bundle', 'web-app', 'tests', 'lab-overlay-occupants.spec.ts'),
      'utf8',
    )
    expect(omit).toContain("'ui-notes'")
    expect(readFileSync(join(root, 'packages', 'bundle', 'web-app', 'cordis.patch.yml'), 'utf8')).toBe('sentinel: keep\n')
  })

  it('refuses a second run on the same directory', () => {
    const root = seedRepo()
    runOverlayNewShaped(['ui-notes'], { repoRoot: root })
    expect(() => runOverlayNewShaped(['ui-notes'], { repoRoot: root })).toThrow(/already exists/)
  })
})
