/**
 * File contents for `pnpm overlay:new-shaped`. Shaped chrome stays
 * `ui-overlay-shaped`; this tree is the overlay-shaped.body occupant package.
 */

/** Inputs that vary per generated shaped occupant package. */
export interface ShapedKitSpec {
  /** Directory under `packages/client/`. */
  readonly dirName: string
  /** npm name `@deepseek-ai/dsh-client-<dirName>`. */
  readonly npmName: string
  /** Locale namespace, `overlay-<slug>`. */
  readonly localeNs: string
  /** Package version copied from the repo root. */
  readonly version: string
}

/**
 * Relative path → file text (trailing newline included).
 * @param spec - directory, npm name, locale namespace, version.
 * @returns the complete frontend-only shaped occupant package.
 */
export function shapedKitFiles(spec: ShapedKitSpec): Record<string, string> {
  const slotId = slotIdFromLocale(spec.localeNs)
  return {
    'package.json': `${JSON.stringify(manifest(spec), null, 2)}\n`,
    'tsconfig.json': `${JSON.stringify(tsconfig(), null, 2)}\n`,
    'tsdown.config.ts': tsdown(spec.npmName),
    'src/css-modules.d.ts': cssModulesDts(),
    'src/index.ts': hostIndex(spec.npmName),
    'src/invariant.ts': invariantSource(spec.npmName, `client-${spec.dirName}-invariant`),
    'src/client/index.ts': clientIndex(spec.dirName, spec.localeNs, slotId),
    'src/client/locales.ts': localesSource(spec.localeNs),
    'src/client/Occupant.tsx': occupantSource(spec.localeNs),
    'src/client/Occupant.module.css': occupantCss(),
    'tests/occupant.client.spec.tsx': occupantSpec(),
    'tests/browser-plugin.client.spec.ts': browserSpec(spec.dirName, spec.localeNs, slotId),
    'tests/invariant.spec.ts': invariantSpec(spec.dirName),
    'README.md': readmeEn(spec.npmName, spec.localeNs),
    'README.zh.md': readmeZh(spec.npmName, spec.localeNs),
  }
}

/** List id on overlay-shaped.body: slug after `overlay-` in the locale namespace. */
export function slotIdFromLocale(localeNs: string): string {
  return localeNs.startsWith('overlay-') ? localeNs.slice('overlay-'.length) : localeNs
}

/* jscpd:ignore-start */
function tsdown(npmName: string): string {
  return `import { clientBundle } from '../tsdown.client.ts'\n\nexport default clientBundle('${npmName}', ['lib/types/index.js', 'lib/types/invariant.js'])\n`
}

function cssModulesDts(): string {
  return `declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}
`
}

function manifest(spec: ShapedKitSpec): Record<string, unknown> {
  return {
    name: spec.npmName,
    description: 'Shaped occupant occupying overlay-shaped.body; authored with overlay:new-shaped',
    version: spec.version,
    publishConfig: { access: 'public' },
    repository: {
      type: 'git',
      url: 'git+https://github.com/deepseek-ai/deepseek-harness.git',
      directory: `packages/client/${spec.dirName}`,
    },
    type: 'module',
    main: 'lib/index.js',
    types: 'lib/types/index.d.ts',
    exports: {
      '.': { types: './lib/types/index.d.ts', default: './lib/index.js' },
      './invariant': { types: './lib/types/invariant.d.ts', default: './lib/invariant.js' },
      './client': { types: './lib/types/client/index.d.ts', default: './lib/client.js' },
      './src/*': './src/*',
      './package.json': './package.json',
    },
    dsh: {
      client: {
        inject: [
          '@deepseek-ai/dsh-client-locale',
          '@deepseek-ai/dsh-client-ui-overlay-shaped',
        ],
        platform: 'web',
        overlayBody: 'overlay-shaped.body',
      },
    },
    scripts: {
      build: 'tsc --pretty false -p tsconfig.json && tsdown',
      bundle: 'tsdown',
      watch: 'tsdown --watch',
    },
    license: 'MIT',
    dependencies: { react: '^18.2.0' },
    peerDependencies: {
      '@deepseek-ai/cordis': 'workspace:^',
      '@deepseek-ai/dsh-client-locale': 'workspace:^',
      '@deepseek-ai/dsh-client-runtime': 'workspace:^',
      '@deepseek-ai/dsh-client-ui-overlay-shaped': 'workspace:^',
      '@deepseek-ai/dsh-client-ui-slots': 'workspace:^',
      '@deepseek-ai/dsh-invariants': 'workspace:^',
    },
    devDependencies: {
      '@deepseek-ai/cordis': 'workspace:^',
      '@deepseek-ai/dsh-client-locale': 'workspace:^',
      '@deepseek-ai/dsh-client-runtime': 'workspace:^',
      '@deepseek-ai/dsh-client-test-runtime': 'workspace:^',
      '@deepseek-ai/dsh-client-ui-overlay-shaped': 'workspace:^',
      '@deepseek-ai/dsh-client-ui-slots': 'workspace:^',
      '@deepseek-ai/dsh-invariants': 'workspace:^',
      '@testing-library/react': '^16.1.0',
      '@types/react': '~18.3.1',
      react: '^18.2.0',
      'react-dom': '^18.2.0',
    },
    files: [
      'lib/index.js',
      'lib/invariant.js',
      'lib/client.js',
      'lib/types/**/*.d.ts',
    ],
  }
}

function tsconfig(): Record<string, unknown> {
  return {
    extends: '../../../tsconfig.base.client.json',
    compilerOptions: { rootDir: 'src', outDir: 'lib/types' },
    include: ['src'],
    references: [
      { path: '../../../vendor/cordis' },
      { path: '../locale' },
      { path: '../runtime' },
      { path: '../ui-overlay-shaped/tsconfig.client.json' },
      { path: '../ui-slots' },
      { path: '../../runtime-diagnostics/invariants' },
    ],
  }
}

function hostIndex(npmName: string): string {
  return `/**
 * ${npmName} node half. The browser half ships via exports["./client"].
 */

/** Host plugin body — the occupant is the browser half. */
export function apply(): void {}
`
}

function invariantSource(npmName: string, invariantName: string): string {
  return `/**
 * Package-owned invariant companion for \`${npmName}\`.
 * @module ${npmName}/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '${npmName}'

/** Cordis companion plugin name. */
export const name = '${invariantName}'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: overlay-shaped.body registration is an effect owned by
 * the slot registry; occupant interaction is component-local React state.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
`
}

function clientIndex(dirName: string, localeNs: string, slotId: string): string {
  return `/**
 * Shaped occupant: occupies overlay-shaped.body. List id \`${slotId}\`.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-overlay-shaped/client'
import { Occupant } from './Occupant.tsx'
import { en, NS, zh, type OverlayShapedKey } from './locales.ts'

export type { OverlayShapedKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy for this overlay-shaped.body occupant. */
    '${localeNs}': OverlayShapedKey
  }
}

/** Required services: the shaped body slot and this occupant's copy. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: dictionaries and the overlay-shaped.body occupant.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), '${dirName}: dictionaries')
  ctx.slots.inject('overlay-shaped.body', () => ctx.slots.register(
    { name: 'overlay-shaped.body', id: '${slotId}', order: 10, locale: NS },
    Occupant,
  ))
}
`
}

function localesSource(localeNs: string): string {
  return `/** \`${localeNs}\` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = '${localeNs}'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'title': '悬件',
  'body': '这是异形身体里的占位剪影。改外形、文案和主按钮。',
  'action': '继续',
  'actionDone': '已继续',
}

/** English dictionary (same key set). */
export const en: Record<OverlayShapedKey, string> = {
  'title': 'Floater',
  'body': 'This is the stub silhouette on the shaped board. Replace the outline, copy, and primary action.',
  'action': 'Continue',
  'actionDone': 'Continued',
}

/** Union of this namespace's dictionary keys. Keep this export name. */
export type OverlayShapedKey = keyof typeof zh
`
}

function occupantSource(localeNs: string): string {
  return `/** Product silhouette for overlay-shaped.body. Replace outline and copy. */

import { useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './Occupant.module.css'

/** Full props composed from the overlay-shaped.body slot. */
export type OccupantProps =
  PropsRuntime<'overlay-shaped.body'>
  & PropsLocale<'${localeNs}'>

/**
 * Designed stub silhouette on the reusable overlay shaped board. Local done
 * state resets when the occupant remounts. The host board stays
 * pointer-events none; hits land on this silhouette. Keep onClick; the
 * host starts Pointer Capture only after drag slop. Host seats translate
 * this outline; the rest pose stays in this CSS.
 * @param props - locale share.
 * @returns the floating outline occupying the shaped body.
 */
export function Occupant({ t }: OccupantProps) {
  const [done, setDone] = useState(false)

  return (
    <div className={css.anchor} data-overlay-shaped-occupant="">
      <div className={css.hit} aria-label={t('title')}>
        <svg className={css.outline} viewBox="0 0 160 160" aria-hidden="true">
          <path d="M80 6 L124 34 L154 80 L124 126 L80 154 L36 126 L6 80 L36 34 Z" />
        </svg>
        <div className={css.face}>
          <p className={css.title}>{t('title')}</p>
          <p className={css.body}>{t('body')}</p>
          <button
            type="button"
            className={css.primary}
            aria-pressed={done}
            onClick={() => { setDone(true) }}
          >
            {done ? t('actionDone') : t('action')}
          </button>
        </div>
      </div>
    </div>
  )
}
`
}

function occupantCss(): string {
  return `/* Rest pose. The host seat translates by the persisted drag offset.
   Theme box-sizing is border-box; line grids and hit targets share one inner size. */
.anchor {
  position: absolute;
  right: 16%;
  top: 22%;
  width: 168px;
  pointer-events: none;
}

.hit {
  position: relative;
  width: 168px;
  height: 168px;
  flex-shrink: 0;
  pointer-events: auto;
}

.outline {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  fill: var(--dsw-alias-bg-elevated);
  stroke: var(--dsw-alias-label-primary);
  stroke-width: 2;
}

.face {
  position: absolute;
  inset: 28px 24px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
  color: var(--dsw-alias-label-primary);
}

.title {
  margin: 0;
  font: var(--dsw-font-s-strong-14);
}

.body {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-xs-12);
}

.primary {
  margin: 0;
  padding: 6px 12px;
  border: 0;
  border-radius: 999px;
  color: var(--dsw-alias-label-primary-foreground);
  background: var(--dsw-alias-button-primary-fill);
  font: var(--dsw-font-xs-strong-12);
  cursor: pointer;
  transition: background var(--ds-transition-duration-fast) var(--ds-ease-in-out);
}

.primary:hover {
  background: var(--dsw-alias-button-primary-hover);
}

.primary:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .primary {
    transition: none;
  }
}
`
}

function occupantSpec(): string {
  return `// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { Occupant, type OccupantProps } from '../src/client/Occupant.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
})

const t = makeTranslate(zh)

function renderOccupant() {
  return render(
    <Occupant
      t={t as OccupantProps['t']}
    />,
  )
}

describe('Occupant', () => {
  it('shows the title', () => {
    const { getByLabelText } = renderOccupant()
    expect(getByLabelText(zh.title).textContent).toContain(zh.title)
  })

  it('marks the primary action pressed after click', () => {
    const { getByRole } = renderOccupant()
    fireEvent.click(getByRole('button', { name: zh.action }))
    expect(getByRole('button', { name: zh.actionDone }).getAttribute('aria-pressed')).toBe('true')
  })
})
`
}

function browserSpec(dirName: string, localeNs: string, slotId: string): string {
  return `import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { Occupant } from '../src/client/Occupant.tsx'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register(
    { name: 'root', children: { 'shell.overlay': { kind: 'list', scope: 'root' } } } as never,
    () => null,
  )
  ctx.slots.register(
    {
      name: 'shell.overlay',
      id: 'overlay-shaped',
      children: { 'overlay-shaped.body': { kind: 'list', scope: 'root' } },
    } as never,
    () => null,
  )
  ctx.provide('locale', new LocaleRuntime(ctx))
  return { ctx }
}

describe('${dirName} browser apply', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('waits until overlay-shaped.body is declared', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.provide('locale', new LocaleRuntime(ctx))
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(ctx.slots.entries('overlay-shaped.body')).toHaveLength(0)
    ctx.slots.register(
      { name: 'root', children: { 'shell.overlay': { kind: 'list', scope: 'root' } } } as never,
      () => null,
    )
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'overlay-shaped',
        children: { 'overlay-shaped.body': { kind: 'list', scope: 'root' } },
      } as never,
      () => null,
    )
    await Promise.resolve()
    expect(ctx.slots.entries('overlay-shaped.body')).toHaveLength(1)
    await fiber.dispose()
  })

  it('registers the occupant and tears it down', async () => {
    const { ctx } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const entry = ctx.slots.entries('overlay-shaped.body')[0]!
    expect(entry.component).toBe(Occupant)
    expect(entry.options.id).toBe('${slotId}')
    expect(entry.options.order).toBe(10)
    expect(entry.locale).toBe('${localeNs}')
    await fiber.dispose()
    expect(ctx.slots.entries('overlay-shaped.body')).toHaveLength(0)
  })
})

describe('${dirName} node half', () => {
  it('the node apply is an inert loader seat', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })
})
`
}

function invariantSpec(dirName: string): string {
  return `import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as OccupantInvariant from '../src/invariant.ts'

describe('${dirName} invariant companion', () => {
  it('registers the package-owned empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(OccupantInvariant)
    await expect(fiber.await()).resolves.toBeDefined()
    await fiber.dispose()
    await expect(ctx.plugin(OccupantInvariant).await()).resolves.toBeDefined()
    await ctx.fiber.dispose()
  })
})
`
}

function readmeEn(npmName: string, localeNs: string): string {
  return `# ${npmName}

English | [中文](README.zh.md)

Shaped occupant occupying overlay-shaped.body on the reusable overlay shaped board. Replace the stub outline, copy, and primary action. The browser half registers Occupant with a list id / order (kind: 'list'). The node half is an inert Loader seat. The default web-app bundle does not mount this package. Live insert is pnpm overlay:live insert of this package after the shaped board is loaded; that command builds lib/ when tsdown.config.ts is present. Inserting this occupant adds; it does not exclusive-disable other overlay-shaped.body occupants. Presentation HOW is [dsh-overlay-shaped-plugins](../../../.agents/skills/dsh-overlay-shaped-plugins/SKILL.md).

The /client exports are the plugin body (apply / inject) and the ${localeNs} locale key union. The occupant component stays package-internal.

## Model Experience

None, as this overlay-shaped.body occupant is a browser-only occupant and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- Must not occupy root, overlay-card.body, overlay-desktop.body, or reuse cursor-agent: root shadows AppFrame; cards and desktop are the other authored forms; cursor-agent is the Cursor overlay panel.
- overlay-shaped.body is kind list: many occupants may stay enabled at once. Do not register a second shell.overlay chrome id.
- Missing host fails loud: insert ui-overlay-shaped first.
- Repeat host insert is a no-op; refresh the host with overlay:live update.
- Drag, persist geometry, overlayStack raise, and hide-while-mounted stay unauthored.
- Stub copy is not a shipped product: replace locales.ts and Occupant.tsx before treating this package as a product occupant.
`
}

function readmeZh(npmName: string, localeNs: string): string {
  return `# ${npmName}

[English](README.md) | 中文

占用 overlay-shaped.body 的异形占用者。替换占位外形、文案和主按钮。浏览器半边注册 Occupant，带 list id / order（kind: list）。节点半边是空的 Loader 座位。默认 web-app 组合包不挂载本包。异形基模装好之后用 pnpm overlay:live insert 现场插入本包；该命令在有 tsdown.config.ts 时会构建 lib/。插入本占用者是追加，不会互斥禁用其它 overlay-shaped.body 占用者。呈现 HOW 是 [dsh-overlay-shaped-plugins](../../../.agents/skills/dsh-overlay-shaped-plugins/SKILL.md)。

/client 导出是插件体（apply / inject）和 ${localeNs} 文案键联合。占用者组件留在包内。

## Model Experience

无。本占用者只是浏览器侧的 overlay-shaped.body 占用者，不注册任何面向模型的内容。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- 不得占用 root、overlay-card.body、overlay-desktop.body 或复用 cursor-agent：root 会盖住 AppFrame；卡片和桌面是另外两种已撰写形态；cursor-agent 是 Cursor overlay 面板。
- overlay-shaped.body 是 kind list：可以同时启用多个占用者。不要再注册第二个 shell.overlay 铬框 id。
- 缺少宿主会大声失败：先插入 ui-overlay-shaped。
- 再次插入宿主是空操作；刷新宿主用 overlay:live update。
- 拖动、持久化几何、overlayStack 置顶、挂着不画仍未撰写。
- 占位文案不是已交付产品：把本包当产品占用者之前，先替换 locales.ts 和 Occupant.tsx。
`
}
/* jscpd:ignore-end */
