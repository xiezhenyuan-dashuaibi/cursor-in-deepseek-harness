# Agent Note: Overlay 桌面基模与互斥占用

Status: implemented

[English](2026-09-10-overlay-desktop-host.md) | 中文

## Problem

第三种 overlay 呈现形态（skill id `dsh-overlay-canvas-plugins`）没有可插入的基模，也没有空页面生成器。贡献者要么占据 `root`，要么把铺满视口的画面塞进 `overlay-card.body`，要么再注册一个 `shell.overlay` 铬框 id。摸鱼背景走的是最后一种。Cursor 的插件列表随后把这条 fiber 当成卡片旁的一行，隐藏也写 Loader `disabled`，于是隐藏和拔出是同一个位。两条这样的 fiber 可以同时启用，叠画在一起。

## Decision

桌面是该第三种形态的产品名，不是第四种形态。可复用基模是 [`ui-overlay-desktop`](../../../../packages/client/ui-overlay-desktop/README.md)。它注册 `shell.overlay` id `overlay-desktop`、order 10，声明唯一子槽 `overlay-desktop.body`（`kind: 'single'`），保持穿透（`data-overlay-board`、`pointer-events: none`），不加入 `ctx.overlayStack`，没有占用者时画填充的「空桌面」。占用者包对 `/client` 做类型导入以拿到 `SlotMap`，绝不值导入画板。`pnpm overlay:new-desktop <name>` 写出仅前端的页面包，以及清单、聚合 tsconfig、模型体验和 omit-list 行。生成的占用者 `tsconfig.json` 引用 `../ui-overlay-desktop/tsconfig.client.json`（composite emit 根），不是 solution `../ui-overlay-desktop`。它不写 `packages/bundle/web-app/cordis.patch.yml`。

[`parseDshClient`](../../../../packages/client/modules/src/index.ts) 在卡片 body 槽之外也记录 `overlay-desktop.body`。未知字符串 `overlayBody` 仍会加入启动图；非字符串会抛出。占用者包仍须声明 `overlay-desktop.body`，插件栏和互斥插入才能分类该行。[`overlay:live insert`](../../../../scripts/overlay-live-plugin.ts) 带该 `overlayBody` 的页面会互斥启用该 Loader 行，并把其它 `overlay-desktop.body` 占用者写成 `disabled: true`。再次插入基模是空操作。缺少基模会立刻失败。切换桌面是互斥启用，不是 `overlay:live remove`，也不删 checkout。

桌面页占据 `overlay-desktop.body`。它不注册第二套 `shell.overlay` 铬框 id。

Cursor 轨最顶一行永远是**桌面**：已插入的占用者（`panelTitle` 或 Loader id），没有占用者则显示空桌面。卸下是 `plugins.setInserted(id, false)`。下面列表展示卡片、未加载的桌面产品、以及其它 overlay fiber。桌面类型行只有切换桌面（`plugins.switchDesktop`）。已插入的占用者不在该列表重复。桌面基模不是产品行。桌面产品没有隐藏文件。受保护 Loader id 包括 `ui-overlay-desktop`，与卡片桌、Cursor、overlay RPC sidecar 同类。现场面板在缓存的 `/overlay-plugins` 仍把基模列成 fiber 时优先走 `/overlay-plugins-rail`。操作 HOW：[dsh-overlay-canvas-plugins](../../../skills/dsh-overlay-canvas-plugins/SKILL.md)。本笔记部分替代 [插件栏 fiber](2026-09-10-overlay-plugin-rail-fibers.md) 里 fiber 隐藏等于 `disabled` 的条款：fiber 隐藏不是第二个 `disabled`。卡片 `hidden` 仍由 [隐藏与 Loader disabled](2026-09-07-overlay-card-hide-and-loader-disabled.md) 拥有。

## Alternatives considered

**第四种 overlay 形态。** 否决——三种形态仍是三种；桌面是 canvas skill 的产品名。

**保留产品自己的 `shell.overlay` 铬框 id。** 否决——那是第二套画板。基模拥有穿透和空桌面回退；页面占据 `overlay-desktop.body`。

**把铺满视口的画面占据 `overlay-card.body`。** 否决——卡片是另一种已撰写形态；桌面不是卡片页。

**占据 `root`。** 否决——`root` 是 AppFrame。

**给桌面产品单独做隐藏文件。** 否决——没有可跳过的窗口。卸下和切换桌面都写占用者 Loader `disabled`。

**fiber 隐藏也写 `disabled`。** 否决——隐藏不是拔出。没有隐藏文件的 fiber 只有插入/拔出。

**同时启用多个桌面占用者。** 否决——`kind: 'single'` 加上互斥 `disabled` 只保留一个现场页面。

## Consequences

先插入基模再插入桌面页，画面垫在卡片和 Cursor 之下，不抢走命中。再插入另一个桌面页会暂停前一个占用者 fiber。插件栏桌面行卸下该 fiber；切换桌面会互斥启用所选占用者。checkout 保留。任意形状 HOW 仍预留。

## Testing

`packages/client/ui-overlay-desktop/tests/` 固定 `shell.overlay` id `overlay-desktop`、空「空桌面」和穿透属性。`scripts/overlay-new-desktop.spec.ts` 固定生成器落地、`overlayBody` 和 `tsconfig.client.json`。`packages/client/modules/tests/node-half.client.spec.ts` 接受 `overlay-desktop.body` 以及 `root` 这类未知字符串；拒绝非字符串 `overlayBody`。`scripts/overlay-live-plugin.spec.ts` 固定缺少基模、再次插入基模、互斥 `disabled`，以及启动图等待分类。`packages/client/ui-cursor-agent/tests/plugin-roster.spec.ts`、`overlay-card-rpc.spec.ts` 和 `cursor-panel.client.spec.tsx` 固定栏顶桌面行、卸下、切换桌面、fiber 没有隐藏、以及卡片隐藏不碰桌面。启动图准入与 `overlayBody` 见 [启动图等待](2026-09-11-overlay-live-client-boot-graph.md)。
