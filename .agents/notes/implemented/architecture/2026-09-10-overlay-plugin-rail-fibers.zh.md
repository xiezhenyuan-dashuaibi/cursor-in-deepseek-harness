# Agent Note: Overlay 插件栏列出卡片与独立 fiber

Status: implemented

[English](2026-09-10-overlay-plugin-rail-fibers.md) | 中文

## Problem

Cursor 轨上的插件列表只读 `/overlay-card` 的 `instances.list`。现场 profile 里占用 `shell.overlay`、但没有 `dsh.client.overlayBody` 的 fiber 已经挂上，却进不了该面板。操作者期望「插件」列出自己插入的全部 overlay 插件，而不是只有卡片窗口。把这些 fiber 塞进 `instances.list` 会让卡片桌面轮询到一扇假窗。

## Decision

轨合并两本名册。卡片仍走 `/overlay-card`（`instances.list` / `instances.setHidden` / `occupants.setInserted`），不进入这条新通道。overlay fiber 和桌面占用者走 `/overlay-plugins`（`plugins.list` 返回 `{ desktop, plugins }`；`plugins.setInserted`；`plugins.switchDesktop`）。当该处理仍把桌面基模列成 fiber 时，现场恢复走 `/overlay-plugins-rail`。

独立 fiber 是现场 **profile** 上的 Loader 行：`plugins/<id>/package.json` 有 `dsh.client`、没有 `overlayBody`，且不是受保护 id（`ui-float-window`、`ui-overlay-desktop`、`ui-cursor-agent` / `cursor-agent`、overlay-card RPC id、`overlay-plugin-roster-rpc`、`overlay-plugin-rail-rpc`）。桌面基模也会按 npm 名 `@deepseek-ai/dsh-client-ui-overlay-desktop` 跳过。桌面占用者是同一次扫描里 `overlayBody: overlay-desktop.body` 的行。标题优先用非空的 `dsh.client.panelTitle`，否则用 Loader id。不列出捆绑的 DSH 铬框。已插入的占用者不在下列表重复。

对 fiber 来说，拔出写该行的 Loader `disabled`。轨不给 fiber 或桌面行提供隐藏。桌面占用、互斥启用和栏顶桌面行由 [桌面基模](2026-09-10-overlay-desktop-host.md) 拥有。桌面轮询仍走 `instances.list`，背景不会变成卡片。

`@deepseek-ai/dsh-client-ui-cursor-agent` 的宿主 `apply` 在进程生命周期内被缓存。overlay fiber 和桌面占用者在该处理仍是当前实现时走 `/overlay-plugins`；已缓存的处理若仍把桌面基模列成 fiber，则走 `./overlay-plugin-rail-rpc.mjs` 上的 `/overlay-plugins-rail`。`overlay:live` 的 insert 或 update 会写这两份 sidecar 和一条 rail Loader 行，从而不必重启 `dsh web` 也能钉住占用者。`/overlay-plugins` 上重复的 `rpc.handle` 被忽略。卡片隐藏与占用者 `disabled` 仍由 [隐藏与 Loader disabled](2026-09-07-overlay-card-hide-and-loader-disabled.md) 拥有。面板铬框仍由 [overlay 叠放](2026-09-07-overlay-stack-and-card-plug.md) 拥有。

## Alternatives considered

**把独立 fiber 追加进 `instances.list` 的 `cards`。** 否决 — 桌面轮询同一条 RPC，会挂上一扇假窗。

**占用 `overlay-card.body`，让背景变成卡片。** 否决 — 穿透桌面页占据 `overlay-desktop.body`；任意形状 HOW 仍预留。

**给 fiber 单独做隐藏文件，与 Loader `disabled` 分开。** 否决 — fiber 没有隐藏标志；轨只提供插入/拔出。桌面产品也没有隐藏文件（[桌面基模](2026-09-10-overlay-desktop-host.md)）。

**列出每一行 Loader，包括捆绑铬框。** 否决 — 面板是现场 overlay 名册，不是 `ui-conversation` 等出厂 DSH 席位。

**只靠已缓存的 `ui-cursor-agent` `apply` 注册 `/overlay-plugins`。** 否决 — 第一次 `apply` 不会再挂；现场恢复靠从未 import 过的 profile specifier。

**把名册放在产品包里。** 否决 — 轨是 Cursor 铬框；桌面页只是其中一个占用者。

## Consequences

现场独立 overlay fiber 会出现在「插件」里，和卡片窗口以及未加载的桌面产品并列。拔出会暂停该 fiber。该行不提供隐藏。卡片桌面不会多出一扇窗。已经缓存 Cursor 宿主 `apply` 的进程，在 `overlay:live` 写下 rail sidecar 之后仍能通过 `/overlay-plugins-rail` 提供桌面占用。栏顶桌面铬框由 [桌面基模](2026-09-10-overlay-desktop-host.md) 拥有。

## Testing

`packages/client/ui-cursor-agent/tests/plugin-roster.spec.ts` 固定列表过滤、yaml `disabled`、桌面互斥启用、基模 npm 名排除，以及 `/overlay-plugins` 的列出/拔出/switchDesktop。`overlay-card-rpc.spec.ts` 固定映射卡片带 `kind: 'card'`、桌面展平、fiber/desktop 拒绝隐藏、合并/拔出的路由，以及优先 `/overlay-plugins-rail`。`cursor-panel.client.spec.tsx` 固定栏顶桌面行、卸下、切换桌面，以及没有隐藏的 fiber 行。`browser-plugin.client.spec.ts` 固定合并后的 list 调用和 `switchOverlayDesktop`。`scripts/overlay-live-plugin.spec.ts` 固定 insert 和 update 会写 `./overlay-plugin-roster-rpc.mjs` 和 `./overlay-plugin-rail-rpc.mjs`。
