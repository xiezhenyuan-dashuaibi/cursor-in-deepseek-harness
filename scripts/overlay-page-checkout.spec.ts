import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  dropQuotedListItem,
  isLabOverlayOccupant,
  landCheckoutSurfaces,
  purgeCheckoutOccupant,
  unlandCheckoutSurfaces,
} from './overlay-page-checkout.ts'

const temps: string[] = []

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-overlay-page-checkout-'))
  temps.push(dir)
  return dir
}

function seedLanding(root: string): void {
  mkdirSync(join(root, 'packages', 'bundle', 'web-app', 'tests'), { recursive: true })
  mkdirSync(join(root, 'packages', 'client'), { recursive: true })
  mkdirSync(join(root, 'scripts'), { recursive: true })
  writeFileSync(
    join(root, 'tsconfig.client.json'),
    '{ "references": [\n    { "path": "./packages/client/ui-float-window/tsconfig.client.json" },\n    { "path": "./packages/client/ui-tool" }\n  ] }\n',
  )
  writeFileSync(
    join(root, 'tsconfig.base.json'),
    '{ "compilerOptions": { "paths": {\n      "@deepseek-ai/dsh-client-ui-float-window": ["./packages/client/ui-float-window/src"],\n    } } }\n',
  )
  writeFileSync(
    join(root, 'tsconfig.host.json'),
    '{ "references": [\n    { "path": "./packages/client/ui-lab/tsconfig.host.json" },\n    { "path": "./packages/client/ui-lab-peer/tsconfig.host.json" }\n  ] }\n',
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
  writeFileSync(join(root, 'packages', 'bundle', 'web-app', 'cordis.patch.yml'), '- insert:\n    - id: ui-cursor-agent\n      name: "@deepseek-ai/dsh-client-ui-cursor-agent"\n')
  writeFileSync(
    join(root, 'packages', 'bundle', 'web-app', 'package.json'),
    `${JSON.stringify({ name: '@deepseek-ai/dsh-web-app', dependencies: { '@deepseek-ai/dsh-client-ui-cursor-agent': 'workspace:^' } }, null, 2)}\n`,
  )
}

function writePackage(root: string, dirName: string): void {
  const dest = join(root, 'packages', 'client', dirName)
  mkdirSync(dest, { recursive: true })
  writeFileSync(
    join(dest, 'package.json'),
    `${JSON.stringify({ name: `@deepseek-ai/dsh-client-${dirName}`, private: true }, null, 2)}\n`,
  )
}

describe('overlay-page-checkout', () => {
  it('drops an exact quoted list item and keeps a longer sibling name', () => {
    const ids = "const OMITTED_IDS = ['ui-lab', 'ui-lab-peer', 'ui-barber'] as const"
    expect(dropQuotedListItem(ids, 'ui-lab')).toBe(
      "const OMITTED_IDS = ['ui-lab-peer', 'ui-barber'] as const",
    )
    const pkgs = [
      'const OMITTED_PACKAGES = [',
      "  '@deepseek-ai/dsh-client-ui-lab',",
      "  '@deepseek-ai/dsh-client-ui-lab-peer',",
      '] as const',
      '',
    ].join('\n')
    expect(dropQuotedListItem(pkgs, '@deepseek-ai/dsh-client-ui-lab')).toContain(
      '@deepseek-ai/dsh-client-ui-lab-peer',
    )
    expect(dropQuotedListItem(pkgs, '@deepseek-ai/dsh-client-ui-lab')).not.toContain(
      "'@deepseek-ai/dsh-client-ui-lab',",
    )
  })

  it('lands then unlands without touching a prefix sibling', () => {
    const root = tempDir()
    seedLanding(root)
    writePackage(root, 'ui-lab')
    writePackage(root, 'ui-lab-peer')
    landCheckoutSurfaces(root, {
      dirName: 'ui-lab',
      npmName: '@deepseek-ai/dsh-client-ui-lab',
    })
    landCheckoutSurfaces(root, {
      dirName: 'ui-lab-peer',
      npmName: '@deepseek-ai/dsh-client-ui-lab-peer',
    })
    unlandCheckoutSurfaces(root, {
      dirName: 'ui-lab',
      npmName: '@deepseek-ai/dsh-client-ui-lab',
    })
    const host = readFileSync(join(root, 'tsconfig.host.json'), 'utf8')
    expect(host).not.toContain('ui-lab/tsconfig.host.json')
    expect(host).toContain('ui-lab-peer/tsconfig.host.json')
    const omit = readFileSync(
      join(root, 'packages', 'bundle', 'web-app', 'tests', 'lab-overlay-occupants.spec.ts'),
      'utf8',
    )
    expect(omit).not.toMatch(/'ui-lab'/)
    expect(omit).toContain("'ui-lab-peer'")
    expect(readFileSync(join(root, 'packages', 'client', 'README.md'), 'utf8')).toContain(
      '[`ui-lab-peer/`](ui-lab-peer/README.md)',
    )
    expect(readFileSync(join(root, 'packages', 'client', 'README.md'), 'utf8')).not.toContain(
      '[`ui-lab/`](ui-lab/README.md)',
    )
  })

  it('purges an omitted occupant and keeps the card and a bundle roster package', () => {
    const root = tempDir()
    seedLanding(root)
    writePackage(root, 'ui-notes')
    writePackage(root, 'ui-float-window')
    writePackage(root, 'ui-cursor-agent')
    landCheckoutSurfaces(root, {
      dirName: 'ui-notes',
      npmName: '@deepseek-ai/dsh-client-ui-notes',
    })
    expect(isLabOverlayOccupant(root, 'ui-notes')).toBe(true)
    expect(isLabOverlayOccupant(root, 'ui-float-window')).toBe(false)
    expect(isLabOverlayOccupant(root, 'ui-cursor-agent')).toBe(false)
    expect(purgeCheckoutOccupant(root, 'ui-notes')).toBe(true)
    expect(purgeCheckoutOccupant(root, 'ui-float-window')).toBe(false)
    expect(purgeCheckoutOccupant(root, 'ui-cursor-agent')).toBe(false)
    expect(() => readFileSync(join(root, 'packages', 'client', 'ui-notes', 'package.json'))).toThrow()
    expect(readFileSync(join(root, 'packages', 'client', 'ui-float-window', 'package.json'), 'utf8')).toContain(
      'ui-float-window',
    )
    expect(readFileSync(join(root, 'tsconfig.client.json'), 'utf8')).not.toContain('ui-notes')
    expect(readFileSync(join(root, 'packages', 'client', 'README.md'), 'utf8')).not.toContain('ui-notes')
  })
})
