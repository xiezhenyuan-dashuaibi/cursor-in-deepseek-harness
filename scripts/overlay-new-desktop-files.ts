/**
 * File contents for `pnpm overlay:new-desktop`. Desktop chrome stays
 * `ui-overlay-desktop`; this tree is the overlay-desktop.body page package.
 */

/** Inputs that vary per generated desktop page package. */
export interface DesktopKitSpec {
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
 * @returns the complete frontend-only desktop page package.
 */
export function desktopKitFiles(spec: DesktopKitSpec): Record<string, string> {
  return {
    'package.json': `${JSON.stringify(manifest(spec), null, 2)}\n`,
    'tsconfig.json': `${JSON.stringify(tsconfig(), null, 2)}\n`,
    'tsdown.config.ts': tsdown(spec.npmName),
    'src/css-modules.d.ts': cssModulesDts(),
    'src/index.ts': hostIndex(spec.npmName),
    'src/invariant.ts': invariantSource(spec.npmName, `client-${spec.dirName}-invariant`),
    'src/client/index.ts': clientIndex(spec.dirName, spec.localeNs),
    'src/client/locales.ts': localesSource(spec.localeNs),
    'src/client/Page.tsx': pageSource(spec.localeNs),
    'src/client/Page.module.css': pageCss(),
    'tests/page.client.spec.tsx': pageSpec(),
    'tests/browser-plugin.client.spec.ts': browserSpec(spec.dirName, spec.localeNs),
    'tests/invariant.spec.ts': invariantSpec(spec.dirName),
    'README.md': readmeEn(spec.npmName, spec.localeNs),
    'README.zh.md': readmeZh(spec.npmName, spec.localeNs),
  }
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

function manifest(spec: DesktopKitSpec): Record<string, unknown> {
  return {
    name: spec.npmName,
    description: 'Desktop page occupying overlay-desktop.body; authored with overlay:new-desktop',
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
          '@deepseek-ai/dsh-client-ui-overlay-desktop',
        ],
        platform: 'web',
        overlayBody: 'overlay-desktop.body',
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
      '@deepseek-ai/dsh-client-ui-overlay-desktop': 'workspace:^',
      '@deepseek-ai/dsh-client-ui-slots': 'workspace:^',
      '@deepseek-ai/dsh-invariants': 'workspace:^',
    },
    devDependencies: {
      '@deepseek-ai/cordis': 'workspace:^',
      '@deepseek-ai/dsh-client-locale': 'workspace:^',
      '@deepseek-ai/dsh-client-runtime': 'workspace:^',
      '@deepseek-ai/dsh-client-test-runtime': 'workspace:^',
      '@deepseek-ai/dsh-client-ui-overlay-desktop': 'workspace:^',
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
      { path: '../ui-overlay-desktop/tsconfig.client.json' },
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
 * No runtime invariant: overlay-desktop.body registration is an effect owned by
 * the slot registry; page interaction is component-local React state.
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

function clientIndex(dirName: string, localeNs: string): string {
  return `/**
 * Desktop page: occupies overlay-desktop.body. No id / order.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-overlay-desktop/client'
import { Page } from './Page.tsx'
import { en, NS, zh, type OverlayPageKey } from './locales.ts'

export type { OverlayPageKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy for this overlay-desktop.body page. */
    '${localeNs}': OverlayPageKey
  }
}

/** Required services: the desktop body slot and this page's copy. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: dictionaries and the overlay-desktop.body occupant.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), '${dirName}: dictionaries')
  ctx.slots.inject('overlay-desktop.body', () => ctx.slots.register(
    { name: 'overlay-desktop.body', locale: NS },
    Page,
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
  'title': '桌面',
  'body': '这是桌面身体里的产品页。改标题、说明和主按钮。',
  'action': '继续',
  'actionDone': '已继续',
}

/** English dictionary (same key set). */
export const en: Record<OverlayPageKey, string> = {
  'title': 'Desktop',
  'body': 'This is the product page on the desktop board. Replace the title, copy, and primary action.',
  'action': 'Continue',
  'actionDone': 'Continued',
}

/** Union of this namespace's dictionary keys. Keep this export name. */
export type OverlayPageKey = keyof typeof zh
`
}

function pageSource(localeNs: string): string {
  return `/** Product page for overlay-desktop.body. Replace copy and layout. */

import { useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './Page.module.css'

/** Full props composed from the overlay-desktop.body slot. */
export type PageProps =
  PropsRuntime<'overlay-desktop.body'>
  & PropsLocale<'${localeNs}'>

/**
 * Designed stub page on the reusable overlay desktop. Local done state
 * resets when the occupant remounts.
 * @param props - locale share.
 * @returns the page filling the desktop body.
 */
export function Page({ t }: PageProps) {
  const [done, setDone] = useState(false)

  return (
    <main className={css.page} data-overlay-desktop-page="" aria-label={t('title')}>
      <h1 className={css.title}>{t('title')}</h1>
      <p className={css.body}>{t('body')}</p>
      <button
        type="button"
        className={css.primary}
        aria-pressed={done}
        onClick={() => { setDone(true) }}
      >
        {done ? t('actionDone') : t('action')}
      </button>
    </main>
  )
}
`
}

function pageCss(): string {
  return `.page {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 20px;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: 36px 32px 36px;
  pointer-events: auto;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base);
}

.title {
  margin: 0;
  font: var(--dsw-font-xl-strong-28);
}

.body {
  margin: 0;
  max-width: 36em;
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-m-16);
}

.primary {
  align-self: flex-start;
  margin: 0;
  padding: 10px 20px;
  border: 0;
  border-radius: 8px;
  color: var(--dsw-alias-label-primary-foreground);
  background: var(--dsw-alias-button-primary-fill);
  font: var(--dsw-font-s-strong-14);
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

function pageSpec(): string {
  return `// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { Page, type PageProps } from '../src/client/Page.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
})

const t = makeTranslate(zh)

function renderPage() {
  return render(
    <Page
      t={t as PageProps['t']}
    />,
  )
}

describe('Page', () => {
  it('shows the title', () => {
    const { getByRole } = renderPage()
    expect(getByRole('heading', { level: 1 }).textContent).toBe(zh.title)
  })

  it('marks the primary action pressed after click', () => {
    const { getByRole } = renderPage()
    fireEvent.click(getByRole('button', { name: zh.action }))
    expect(getByRole('button', { name: zh.actionDone }).getAttribute('aria-pressed')).toBe('true')
  })
})
`
}

function browserSpec(dirName: string, localeNs: string): string {
  return `import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { Page } from '../src/client/Page.tsx'
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
      id: 'overlay-desktop',
      children: { 'overlay-desktop.body': { kind: 'single', scope: 'root' } },
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

  it('waits until overlay-desktop.body is declared', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.provide('locale', new LocaleRuntime(ctx))
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(ctx.slots.entries('overlay-desktop.body')).toHaveLength(0)
    ctx.slots.register(
      { name: 'root', children: { 'shell.overlay': { kind: 'list', scope: 'root' } } } as never,
      () => null,
    )
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'overlay-desktop',
        children: { 'overlay-desktop.body': { kind: 'single', scope: 'root' } },
      } as never,
      () => null,
    )
    await Promise.resolve()
    expect(ctx.slots.entries('overlay-desktop.body')).toHaveLength(1)
    await fiber.dispose()
  })

  it('registers the page and tears it down', async () => {
    const { ctx } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const entry = ctx.slots.entries('overlay-desktop.body')[0]!
    expect(entry.component).toBe(Page)
    expect(entry.locale).toBe('${localeNs}')
    await fiber.dispose()
    expect(ctx.slots.entries('overlay-desktop.body')).toHaveLength(0)
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
import * as PageInvariant from '../src/invariant.ts'

describe('${dirName} invariant companion', () => {
  it('registers the package-owned empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(PageInvariant)
    await expect(fiber.await()).resolves.toBeDefined()
    await fiber.dispose()
    await expect(ctx.plugin(PageInvariant).await()).resolves.toBeDefined()
    await ctx.fiber.dispose()
  })
})
`
}

function readmeEn(npmName: string, localeNs: string): string {
  return `# ${npmName}

English | [中文](README.zh.md)

Desktop page occupying overlay-desktop.body on the reusable overlay desktop. Replace the stub title, body copy, and primary action. The browser half registers Page with no id / order (kind: 'single'). The node half is an inert Loader seat. The default web-app bundle does not mount this package. Live insert is pnpm overlay:live insert of this package after the desktop board is loaded; that command builds lib/ when tsdown.config.ts is present. Inserting this page exclusive-disables every other overlay-desktop.body occupant. Presentation HOW is [dsh-overlay-canvas-plugins](../../../.agents/skills/dsh-overlay-canvas-plugins/SKILL.md).

The /client exports are the plugin body (apply / inject) and the ${localeNs} locale key union. The page component stays package-internal.

## Model Experience

None, as this overlay-desktop.body page is a browser-only occupant and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- Must not occupy root, overlay-card.body, or reuse cursor-agent: root shadows AppFrame; cards are the other authored form; cursor-agent is the Cursor overlay panel.
- overlay-desktop.body is kind single: this page is the sole occupant while inserted. Switching desktops disables this fiber.
- No hide file: the rail 桌面 row only 卸下 (Loader disabled).
- Stub copy is not a shipped product: replace locales.ts and Page.tsx before treating this package as a product occupant.
`
}

function readmeZh(npmName: string, localeNs: string): string {
  return `# ${npmName}

[English](README.md) | 中文

占用 overlay-desktop.body 的桌面页面。替换占位标题、说明和主按钮。浏览器半边注册 Page，无 id / order（kind: single）。节点半边是空的 Loader 座位。默认 web-app 组合包不挂载本包。桌面基模装好之后用 pnpm overlay:live insert 现场插入本包；该命令在有 tsdown.config.ts 时会构建 lib/。插入本页会把其它 overlay-desktop.body 占用者写成 disabled。呈现 HOW 是 [dsh-overlay-canvas-plugins](../../../.agents/skills/dsh-overlay-canvas-plugins/SKILL.md)。

/client 导出是插件体（apply / inject）和 ${localeNs} 文案键联合。页面组件留在包内。

## Model Experience

无。本页只是浏览器侧的 overlay-desktop.body 占用者，不注册任何面向模型的内容。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- 不得占用 root、overlay-card.body 或复用 cursor-agent：root 会盖住 AppFrame；卡片是另一种已撰写形态；cursor-agent 是 Cursor overlay 面板。
- overlay-desktop.body 是 kind single：插入期间本页是唯一占用者。切换桌面会禁用本 fiber。
- 没有隐藏文件：插件栏桌面行只有卸下（Loader disabled）。
- 占位文案不是已交付产品：把本包当产品占用者之前，先替换 locales.ts 和 Page.tsx。
`
}
/* jscpd:ignore-end */
