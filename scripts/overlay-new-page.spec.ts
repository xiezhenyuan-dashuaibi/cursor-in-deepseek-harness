import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parsePageName, runOverlayNewPage } from './overlay-new-page.ts'

const temps: string[] = []

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-overlay-new-page-'))
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
      '{ "references": [\n    { "path": "./packages/client/ui-float-window/tsconfig.client.json" },\n    { "path": "./packages/client/ui-tool" }\n  ] }\n',
    )
    writeFileSync(
      join(root, 'tsconfig.base.json'),
      '{ "compilerOptions": { "paths": {\n      "@deepseek-ai/dsh-client-ui-float-window": ["./packages/client/ui-float-window/src"],\n    } } }\n',
    )
    writeFileSync(
      join(root, 'packages', 'client', 'README.md'),
      '| [`ui-float-window/`](ui-float-window/README.md) | Canonical reusable overlay card desk on `shell.overlay`; insert this package with `--title` / `--card-id` / `--width` / `--height` (repeat insert adds another card), then occupy `overlay-card.body`. |\n| [`ui-tool/`](ui-tool/README.md) | Tools. |\n',
    )
    writeFileSync(
      join(root, 'packages', 'client', 'README.zh.md'),
      '| [`ui-float-window/`](ui-float-window/README.md) | 规范的可复用 overlay 卡片桌面，占据 `shell.overlay`；插入本包并传入 `--title` / `--card-id` / `--width` / `--height`（再次插入会再加一张卡片），再占据 `overlay-card.body`。 |\n| [`ui-tool/`](ui-tool/README.md) | 工具。 |\n',
    )
    writeFileSync(
      join(root, 'scripts', 'verify-package-readme-model-experience.ts'),
      '  \'packages/client/ui-float-window\': { kind: \'none\', reason: \'Reusable overlay card desk; registers nothing model-facing.\' },\n',
    )
    writeFileSync(
      join(root, 'packages', 'bundle', 'web-app', 'tests', 'lab-overlay-occupants.spec.ts'),
      'const OMITTED_IDS = [\'ui-lab\'] as const\nconst OMITTED_PACKAGES = [\n  \'@deepseek-ai/dsh-client-ui-lab\',\n] as const\n',
    )
  }
  return root
}

describe('overlay-new-page', () => {
  it('parses a kebab directory, packages/client prefix, and ui- locale slug', () => {
    expect(parsePageName('notes')).toEqual({
      dirName: 'notes',
      npmName: '@deepseek-ai/dsh-client-notes',
      localeNs: 'overlay-notes',
    })
    expect(parsePageName('packages/client/ui-notes')).toEqual({
      dirName: 'ui-notes',
      npmName: '@deepseek-ai/dsh-client-ui-notes',
      localeNs: 'overlay-notes',
    })
    expect(() => parsePageName('../escape')).toThrow(/directory segment/)
    expect(() => parsePageName('packages/client/a/b')).toThrow(/single/)
    expect(() => parsePageName('')).toThrow(/name is required/)
    expect(() => parsePageName('Notes')).toThrow(/kebab-case/)
  })

  it('refuses usage without a name and a missing root version', () => {
    const root = seedRepo()
    expect(() => runOverlayNewPage([], { repoRoot: root })).toThrow(/usage/)
    writeFileSync(join(root, 'package.json'), `${JSON.stringify({ name: '@deepseek-ai/dsh-root' }, null, 2)}\n`)
    expect(() => runOverlayNewPage(['ui-notes'], { repoRoot: root })).toThrow(/missing version/)
  })

  it('writes the page kit and does not touch the web-app bundle patch', () => {
    const root = seedRepo()
    const message = runOverlayNewPage(['ui-notes'], { repoRoot: root })
    expect(message).toContain('packages/client/ui-notes')
    expect(message).toContain('@deepseek-ai/dsh-client-ui-notes')
    const dest = join(root, 'packages', 'client', 'ui-notes')
    const pkg = JSON.parse(readFileSync(join(dest, 'package.json'), 'utf8')) as {
      name: string
      version: string
      dsh: { client: { inject: string[]; overlayBody?: string } }
    }
    expect(pkg.name).toBe('@deepseek-ai/dsh-client-ui-notes')
    expect(pkg.version).toBe('0.1.0-test')
    expect(pkg.dsh.client.inject).toContain('@deepseek-ai/dsh-client-ui-float-window')
    expect(pkg.dsh.client.overlayBody).toBe('overlay-card.body')
    const client = readFileSync(join(dest, 'src', 'client', 'index.ts'), 'utf8')
    expect(client).toContain("name: 'overlay-card.body'")
    expect(client).toContain('overlay-notes')
    expect(readFileSync(join(dest, 'src', 'client', 'Page.tsx'), 'utf8')).toContain('preferFrame(PREFERRED_FRAME)')
    expect(readFileSync(join(dest, 'tests', 'page.client.spec.tsx'), 'utf8')).toContain('PREFERRED_FRAME')
    expect(readFileSync(join(dest, 'tests', 'browser-plugin.client.spec.ts'), 'utf8')).toContain('overlay-card.body')
    expect(readFileSync(join(dest, 'README.md'), 'utf8')).toContain('## Model Experience')
    expect(readFileSync(join(dest, 'README.md'), 'utf8')).toContain('dsh-overlay-web-plugins/SKILL.md')
    expect(readFileSync(join(dest, 'README.zh.md'), 'utf8')).toContain('dsh-overlay-web-plugins/SKILL.md')
    expect([
      'package.json',
      'tsconfig.json',
      'tsdown.config.ts',
      'src/css-modules.d.ts',
      'src/index.ts',
      'src/invariant.ts',
      'src/client/index.ts',
      'src/client/locales.ts',
      'src/client/Page.tsx',
      'src/client/Page.module.css',
      'tests/page.client.spec.tsx',
      'tests/browser-plugin.client.spec.ts',
      'tests/invariant.spec.ts',
      'README.md',
      'README.zh.md',
    ].every(rel => readFileSync(join(dest, ...rel.split('/')), 'utf8').length > 0)).toBe(true)
    expect(readFileSync(join(root, 'packages', 'bundle', 'web-app', 'cordis.patch.yml'), 'utf8')).toBe('sentinel: keep\n')
    expect(() => readFileSync(join(dest, 'cordis.patch.yml'))).toThrow()
  })

  it('lands inventory, tsconfig, and omit rows without touching the bundle patch', () => {
    const root = seedRepo(true)
    runOverlayNewPage(['ui-notes'], { repoRoot: root })
    expect(readFileSync(join(root, 'tsconfig.client.json'), 'utf8')).toContain(
      './packages/client/ui-notes',
    )
    expect(readFileSync(join(root, 'tsconfig.base.json'), 'utf8')).toContain(
      '@deepseek-ai/dsh-client-ui-notes',
    )
    expect(readFileSync(join(root, 'packages', 'client', 'README.md'), 'utf8')).toContain(
      '[`ui-notes/`](ui-notes/README.md)',
    )
    expect(readFileSync(join(root, 'packages', 'client', 'README.zh.md'), 'utf8')).toContain(
      '[`ui-notes/`](ui-notes/README.md)',
    )
    expect(readFileSync(join(root, 'scripts', 'verify-package-readme-model-experience.ts'), 'utf8'))
      .toContain("'packages/client/ui-notes'")
    const omit = readFileSync(
      join(root, 'packages', 'bundle', 'web-app', 'tests', 'lab-overlay-occupants.spec.ts'),
      'utf8',
    )
    expect(omit).toContain("'ui-notes'")
    expect(omit).toContain('@deepseek-ai/dsh-client-ui-notes')
    expect(readFileSync(join(root, 'packages', 'bundle', 'web-app', 'cordis.patch.yml'), 'utf8')).toBe('sentinel: keep\n')
  })

  it('refuses a second run on the same directory', () => {
    const root = seedRepo()
    runOverlayNewPage(['ui-notes'], { repoRoot: root })
    expect(() => runOverlayNewPage(['ui-notes'], { repoRoot: root })).toThrow(/already exists/)
  })
})
