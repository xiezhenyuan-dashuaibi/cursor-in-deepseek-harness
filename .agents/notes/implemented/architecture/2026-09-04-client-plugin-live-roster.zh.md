# Agent Note: Live client-plugin roster without a page refresh

Status: implemented

[English](2026-09-04-client-plugin-live-roster.md) | 中文

## Problem

普通客户端插件以包文件加 Loader 行持久化。进程重启会再装那一行，所以插件不会被清掉。占用者内部的 React 状态可以重置。这一层耐久性本来就成立。

现场插入和删除并不成立。`watchUserPatches` 已经能在不重启 web 进程的情况下重组 `$DSH_HOME/profiles/<name>/cordis.patch.yml` 和 `$DSH_HOME/cordis.patch.yml`。宿主客户端模块表会跟随这些 Loader fiber。已打开的页面不会：SSE `graph` 帧只在 EventSource 连接时发送，浏览器半边还把它们丢掉。对页面从未创建过的名字发 `rebuilt` 只是一条警告。第一次扫描时 `require.resolve` 失败的包名会一直保持不可解析，直到进程重启，因此在 `pnpm install` 完成之前写下的行永远进不了图。

编辑 `packages/bundle/web-app/cordis.patch.yml` 仍只在启动时读取；`composeLive` 在启动时快照组合包 patch。那不是本笔记的插入路径。

## Decision

[`@deepseek-ai/dsh-client-hmr`](../../../../packages/client/hmr/README.md) 在连接时以及每次宿主名录变化时广播 `graph` 帧，并且排在可能发出 `rebuilt` 的新行重哈希之前。浏览器半边把该名录与现场 loader 树做差：在模块表上 [`adoptRow`](../../../../packages/client/modules/README.md) / `dropRow`，对新名字 `loader.create`，对宿主已去掉的名字 `loader.remove`。它永不卸载 `@deepseek-ai/dsh-client-modules`、`@deepseek-ai/dsh-client-hmr` 或 `@deepseek-ai/dsh-client-app-shell`。graph 应用与 rebuilt 交换共享同一条串行队列。

[`ClientModuleRegistry`](../../../../packages/client/modules/src/index.ts) 在下一次 dirty flush 时重试 `unresolvable` 元数据判定。成功解析与「不是 web 客户端」的判定保持缓存。组合包内容仍然只通过 `rebuilt` 进入图。

现场 web 进程监视的增删文件仍是 profile 或 home 的 `cordis.patch.yml`（[app-boot](../../../../packages/boot/app-boot/README.md)）。已在名录中的插件要无刷新热换源码，仍需要 `pnpm run dev:web` 改写 `lib/client.js`，或者在页面从 `$DSH_HOME/profiles/<name>/plugins/` 加载时覆盖那份副本（[dsh-overlay-web-plugins](../../../skills/dsh-overlay-web-plugins/SKILL.md)）。Dynamic Cordis 包仍是进程内存（[自指工具集](../feature/2026-07-08-self-referential-cordis-toolset.md)）；本笔记不保存它们。overlay extra 在 MCP 子进程里跑，不在 web 进程。现场插入普通插件才是 overlay 产品路径（[现场路径](2026-09-04-overlay-web-plugin-live-path.md)）。

## Alternatives considered

**让 `composeLive` 监视并重读 web-app 组合包 `cordis.patch.yml`。** 否决 — 组合包层是出荷组成；现场用户编辑属于已经在监视的 profile 与 home 文件。进程运行时重读组合包会把检出组成变成热文件。

**把未知的 `rebuilt` id 当成隐式创建。** 否决 — 创建需要图行的 url/rev。`graph` 帧才是名录权威；`rebuilt` 只负责内容。

**让每一种否定 `pkgMeta` 缓存都过期，包括「不是 web 客户端」。** 否决 — 内建项和非客户端宿主插件会在每次 fiber 事件时重读 `package.json`。只重试 `unresolvable` 就能覆盖首次未命中之后才出现在磁盘上的包。

**用整页刷新作为名录更新。** 否决 — 这无法满足「新插件或已删插件在已打开的页面上立即生效」。

## Consequences

只要包可解析且 `lib/client.js` 存在，客户端插件的 Loader 行一旦落到被监视的用户 patch 里，就会出现在已打开的 `dsh web` 页面上；删掉那一行就会消失，无需重启 web 进程或刷新浏览器。宿主 node 半边的 HMR 代码仍只在进程启动时加载（web 挂载的是无模块根的只监视 Cordis HMR）。占用者的 React 状态在配置项重挂时仍会重置。在得到 `not-client` 判定之后才给 package.json 加上 `dsh.client` 的包仍需要进程重启。

## Testing

`packages/client/hmr/tests/node-half.client.spec.ts` 打开 `/plugins/events` 并断言随后的名录变化会写入 `graph` 帧。`packages/client/hmr/tests/browser-half.client.spec.ts` 覆盖 graph 增删、保留内核名、未知 rebuilt 警告，以及畸形 graph 的日志。`packages/client/modules/tests/loader.client.spec.ts` 钉住 `adoptRow` / `dropRow`。`packages/client/modules/tests/node-half.client.spec.ts` 在包出现在磁盘之后重试不可解析的名字。
