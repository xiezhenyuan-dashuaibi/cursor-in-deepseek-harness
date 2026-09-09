# Agent Note: overlay 卡片名册需要现场 `/overlay-card` 通道

Status: implemented

[English](2026-09-06-overlay-card-roster-channel.md) | 中文

## Problem

写入 `instances.json` 的第二张 overlay 卡片从未出现。桌面 store 只挂 RPC 名册。对正在跑的 `dsh web` POST `/overlay-card/instances.list` 返回 HTTP 405 和 SPA `index.html` 回退，说明通道没有注册。浏览器轮询没有 `try/catch`；一抛就停在默认的一张卡片名册。空座位也只画玻璃铬框，贴在大页面旁边很容易看成没有。页面 `preferFrame` 变大盖住后一张时，会继续往右推，常常推出 overlay 画布（壳层 frame 是 `overflow: hidden`）。

`@deepseek-ai/dsh-client-ui-float-window` 的宿主 fiber 可以是 `active`，跑的却仍是该**包名**第一次 ESM `apply`。Loader 不会在同一包名下为新的 `file:` 目录再导入一次。宿主 `lib/index.js` 不会热换（[现场路径](../architecture/2026-09-04-overlay-web-plugin-live-path.md)）。

## Decision

节点半在 `apply` 里调用 `ctx.connection.rpc.handle('/overlay-card', …)`；`rpc.handle` 已经拥有这条路由的 effect，不必再包一层 `ctx.effect`。重复的 `rpc.handle` 被忽略，这样已经占用该通道的 sidecar 不会让包 fiber 失败。`pnpm overlay:live insert` 或 `update` 卡片包会在 profile 还没有 overlay-card RPC 行时写入 `$DSH_HOME/profiles/web/overlay-card-roster-rpc.mjs` 和一行 Loader（`id: overlay-card-roster-rpc`，`name: ./overlay-card-roster-rpc.mjs`）。该 specifier 独立于 npm 包名的 ESM 缓存，因此一条插入命令就能在已经导入过 `@deepseek-ai/dsh-client-ui-float-window` 的进程上挂上 `/overlay-card`。第一次 `/overlay-card` 处理仍然先到先得且不会热换：只读 list 的 `apply` 会拒绝 `instances.setHidden` 和 `occupants.setInserted`。同一次插入或更新会写入 `./overlay-card-plug-rpc.mjs`（`id: overlay-card-plug-rpc`）挂上 `/overlay-card-plug`，隐藏和插入写入就能打到现场 `instances.json` 和 profile patch，而不替换那个先到的处理。卡片 `update` 还会写 `./overlay-card-hide-rpc.mjs`，并在 patch 里已有第一个 plug-rpc URL 时改写该 Loader `name`，这样 Node 会在同一条 `/overlay-card-plug` 上重新挂上隐藏/插入 `apply`。Cursor 面板先打 `/overlay-card` 再打 `/overlay-card-plug`。模块读取该包名下的 `plugins/*/instances.json`。包 `apply` 在每次 RPC 上解析名册目录：现场副本存在时读 `$DSH_HOME/profiles/<name>/plugins/<id>/instances.json`，否则才是 checkout 里默认的一张卡片。overlay 插入、隐藏、拔出、桌面轮询和 Cursor 插件面板共用该名册。现场已有的 `./overlay-card-rpc.mjs` 行算作已经挂上；插入不再加第二行名册通道。通道行存在之后，再插入同一包仍然只追加 `instances.json`。名册轮询吞掉传输失败并保留上一份快照。没有占用者的窗体槽渲染实底的 `chrome.empty`（`空卡片`）。插入之后 `preferFrame` 和缩放不移动其它座位（[隔离](../architecture/2026-09-06-overlay-card-isolation.md)）。卡片名册格式和插入标志仍由[overlay 卡片容器](../architecture/2026-09-05-overlay-card-container.md)拥有。隐藏与 Loader `disabled` 由[隐藏与 Loader disabled](../architecture/2026-09-07-overlay-card-hide-and-loader-disabled.md)拥有。其它现场宿主逻辑仍需要从未导入过的 specifier，不能对同一包名 `overlay:live update`。

## Alternatives considered

**用打进客户端 bundle 的 `instances.json` 驱动桌面。** 否决 — 插入必须能加卡片而不重建 `lib/client.js`。

**由 `client-modules` 的 `/plugins` 提供 `instances.json`。** 否决于正在跑的进程 — 那一半宿主同样是第一次导入缓存。产品路径仍是专用的 `/overlay-card` 通道。

**被盖住的兄弟只往右推。** 否决 — 页面 960px 的 `preferFrame` 会把后一张 520px 卡片推出常见 overlay 画布。

## Consequences

通道缺失不再看起来像「插入没生效」：第一张会留着，直到 `/overlay-card` 真正挂上，名册才能变长。对卡片包执行一次 `overlay:live insert` 就足以挂上该通道并追加一条 spec。多出来的空卡片是带标签的窗。其它现场宿主 RPC 仍要从未导入过的 specifier，不能对同一包名 `overlay:live update`。

## Testing

`packages/client/ui-float-window/tests/apply.host.spec.ts` 钉住 `instances.list`，以及 `/overlay-card` 在插件 fiber 存活期间是 `webServer` 前缀，重复注册 `/overlay-card` 会被忽略，以及 source-launch checkout `src/` 会优先现场 profile 的 `instances.json`。`roster.client.spec.ts` 在 RPC 抛错时保留默认名册。`overlay-card.client.spec.tsx` 钉住空窗体标签，以及缩放一个座位时兄弟外框不变。`scripts/overlay-live-plugin.spec.ts` 钉住卡片插入在缺失时写入 `./overlay-card-roster-rpc.mjs`（含 `instances.setHidden` 和 `occupants.setInserted`）、写入 `./overlay-card-plug-rpc.mjs` 挂上 `/overlay-card-plug`、已有 `overlay-card-rpc` 时不加第二行名册通道、卡片 `update` 在缺失时补上 plug 行、该行已存在时把 plug-rpc 改到 `./overlay-card-hide-rpc.mjs`，以及再次插入仍追加 `instances.json`。已知缺口：没有自动化测试证明 Node 会保留 profile `file:` URL 的第一次 `apply`；那条钉在现场路径笔记里。
