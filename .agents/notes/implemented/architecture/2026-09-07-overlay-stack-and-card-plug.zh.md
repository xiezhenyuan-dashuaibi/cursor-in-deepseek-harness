# Agent Note: Overlay 叠放与卡片插拔

Status: implemented

[English](2026-09-07-overlay-stack-and-card-plug.md) | 中文

## Problem

Overlay 卡片会盖住 Cursor 对话窗。卡片在 `shell.overlay` 里的 `z-index` 从 40 起，而 Cursor 窗的 CSS 是 `z-index: 1`。卡片本地的 `bringToFront` 只排序桌面内座位，所以点卡片不能把 Cursor 送到桌面后面，点 Cursor 也不能越过 40。客户端插件不得互相 value-import，因此哪一边都不能放一份共享 z 列表。操作者还需要隐藏一张卡片，但不删除其 checkout 包，也不跑 `overlay:live remove`。

## Decision

[`ui-layout`](../../../../packages/client/ui-layout/README.md) 提供 `ctx.overlayStack`。该面只排序两个占用者：id `cursor-agent`（Cursor 窗）和 id `overlay-card`（整张卡片桌面）。`raise(id)` 把该 id 追加到 `front`；内联 `z-index` 为 `40 + index`。启动时 `front` 是 `[overlay-card, cursor-agent]`，因此首帧 Cursor 在上。快照对象在 `raise` 真正改顺序之前保持同一引用；inject `hooks` 把 `HostObservable` 绑成 `useOverlayStack`。

Cursor 窗在鼠标左键 `pointerdown` 捕获阶段调用 `raise('cursor-agent')`。overlay-card 白板设置 `isolation: isolate` 以及来自 stack 的桌面 `z-index`，因此每张卡片的 `z-index` 不再与 Cursor 竞争。白板捕获先 `raise('overlay-card')`，再由卡片自己的 `bringToFront` 排序。白板空白仍是 `pointer-events: none`，空隙里的点击仍能打到 Cursor。最小化后的 Cursor 精灵不走 overlayStack 计算：内联 `z-index` 固定为 80，高于 `40 + index`，因此抬起桌面也盖不住泡泡。展开后恢复 overlayStack 顺序。

[`OverlayCardSpec.hidden`](../../../../packages/client/ui-float-window/README.md) 跳过桌面挂载；占用者 Loader `disabled` 才是真正拔出（[隐藏与 Loader disabled](2026-09-07-overlay-card-hide-and-loader-disabled.md)）。持久文件是 `$DSH_HOME/profiles/<name>/plugins/<id>/instances.json`。宿主 `/overlay-card` 在每次 `instances.list` 和 `instances.setHidden` 上解析该目录；`occupants.setInserted` 改现场 profile patch。checkout 的 `instances.json` 只是默认的一张卡片。第一次 `/overlay-card` 的 `apply` 不会热换，因此只读 list 的处理会拒绝这些写入。`overlay:live` 插入或更新卡片包会写入 `./overlay-card-plug-rpc.mjs`（`/overlay-card-plug`）；Cursor 面板先打 `/overlay-card` 再打该通道。桌面轮询仍用 `/overlay-card` 的 `instances.list`，会从 patch 带上只在线上的 `inserted`。Cursor 轨把 `+` 紧挨会话列表，插件入口放在整板底部。点击后在展开的左栏、入口正上方打开浮层；指针离开浮层即收起。列表视口为 3.5 行，其余上下滚动。浮层列出卡片的 `--title` / `--card-id` 以及独立 overlay fiber，并提供隐藏/显示和插入/拔出（[轨上的 fiber](2026-09-10-overlay-plugin-rail-fibers.md)）。桌面轮询仍走卡片名册；面板再合并 `/overlay-plugins`。overlay 插入、删除、隐藏、拔出以及之后的 `dsh web` 启动看到同一批卡片座位。它不调用 `overlay:live remove`，也不删除 `packages/client/<name>`。Cursor 与卡片桌面各自复制占用者 id 和 z-index 辅助函数；Cursor 还复制 `/overlay-card`、`/overlay-card-plug` 与 `/overlay-plugins` 通道字符串和列表类型。两边都不 value-import 对方或 `ui-layout`。

相关记录：[overlay-card 容器](2026-09-05-overlay-card-container.md)、[隐藏与 Loader disabled](2026-09-07-overlay-card-hide-and-loader-disabled.md)、[轨上的 fiber](2026-09-10-overlay-plugin-rail-fibers.md)、[漂浮 Cursor overlay](../feature/2026-08-31-floating-cursor-cli-overlay.md)。

## Alternatives considered

**把每张卡片和 Cursor 放进同一条 z 列表。** 否决 — 卡片仍是一张桌面；座位顺序留在桌面 store。跨插件契约是两个占用者的共享 stack。

**用新的 `overlay:new-page` 卡片做插件管理器。** 否决 — 入口在 Cursor 轨，不是另一张 `overlay-card.body` 页面。

**从 UI 调用 `overlay:live remove` 或删除 checkout。** 否决 — 隐藏是 `hidden`；拔出是 Loader `disabled`；破坏性清理容易做错，不在本切。

**从 `ui-cursor-agent` value-import `ui-float-window`，或从 `ui-layout` value-import 占用者 id。** 否决 — 客户端插件只通过 slot 和 ctx 服务共享 JSON 与回调；占用者 id 和 z-index 辅助函数各自复制。

**在窗口组件里手写 `useSyncExternalStore`。** 否决 — inject `hooks` 已经绑定 `HostObservable`。

**把最小化精灵放进 overlayStack 当第三个占用者。** 否决 — 泡泡不是竞争窗口；无论 `raise` 如何，它都留在两个占用者 stack 之上。

## Consequences

点击 Cursor 窗可在被卡片挡住时把它露出来。点击一张卡片会先抬起整张桌面，再在桌面内置顶该卡片。最小化精灵留在该顺序之上，直到面板展开。隐藏跳过窗口并保留 spec（以及已存外框），以便再显示时挂回。拔出暂停占用者 fiber；`inserted` 为 false 时窗口保持收起（[隐藏与 Loader disabled](2026-09-07-overlay-card-hide-and-loader-disabled.md)）。`dsh web` 启动后宿主读现场名册文件，可见且已插入的座位会再挂上，Cursor 面板列出同一批行。

## Testing

layout 测试覆盖启动顺序、已在最前时跳过通知，以及 `overlayStack` 的 provide/dispose。float-window 测试覆盖忽略重复的 `/overlay-card`、白板 isolation CSS、鼠标左键捕获上的 `raiseDesk`，以及 source launch 会优先现场 profile 的 `instances.json`。隐藏、占用和 Loader `disabled` 的覆盖见 [隐藏与 Loader disabled](2026-09-07-overlay-card-hide-and-loader-disabled.md)。Cursor 测试覆盖窗口 `z-index` 与鼠标左键捕获上的 `raiseWindow`、最小化精灵在桌面置顶时仍在其上、轨上 `+` 仍是会话列表的兄弟、轨上入口正上方带隐藏与插入控件的插件浮层、`/overlay-card-plug` 回退、空列表与失败文案、复制的 `/overlay-card` 通道字符串，以及合并列表上的独立 fiber 行。
