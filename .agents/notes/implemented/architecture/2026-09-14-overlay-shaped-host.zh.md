# Agent Note: Overlay 异形宿主是透明的 list 画板

Status: implemented

[English](2026-09-14-overlay-shaped-host.md) | 中文

## Problem

任意形状 overlay 形态（skill id `dsh-overlay-shaped-plugins`）没有可插入的宿主。贡献者要么用产品自己的铬框 id 占据 `shell.overlay`，要么把非卡片轮廓塞进 `overlay-card.body`，要么停在写着「停下」的预留 skill 后面。第一个产品可以是独立 fiber（[独立 fiber](2026-09-14-overlay-television-standalone-fiber.md)）。第二个形状会去拷那套占用，而不是共享一块画板。占用 `root` 会盖住 AppFrame。占用 `overlay-desktop.body` 会互斥关掉其它桌面，并画出整页，而不是同时存在的轮廓。

## Decision

可复用宿主是 [`ui-overlay-shaped`](../../../../packages/client/ui-overlay-shaped/README.md)。它把 `shell.overlay` 注册为 id `overlay-shaped`、order 180，声明唯一子槽 `overlay-shaped.body`（`kind: 'list'`），保持穿透（`data-overlay-board`、`pointer-events: none`），不画铬框也不画空状态文案，也不加入 `ctx.overlayStack`。占用者包对 `/client` 做类型导入以拿到 `SlotMap`，绝不值导入画板。可以同时启用多个占用者 Loader fiber。再次插入宿主是空操作。缺少宿主会大声失败。再插入另一个异形占用者是追加，不会互斥禁用已有占用者。

[`parseDshClient`](../../../../packages/client/modules/src/index.ts) 把 `overlay-shaped.body` 和卡片、桌面 body 槽一起记录。未知字符串 `overlayBody` 仍加入启动图；非字符串会抛错。占用者包声明 `overlay-shaped.body`，以便插件栏把该行列为 `shaped`（隐藏加拔出）。宿主自身不出现在列表里，和桌面基模一样。卡片侧的隐藏/拔出仍不得禁用 `ui-overlay-shaped`。卸载画板用 `overlay:live remove`。

异形页面占据 `overlay-shaped.body`。它不再注册第二个 `shell.overlay` 铬框 id。占用者插入与生成 HOW 见 [overlay 异形占用者生成](../process/2026-09-14-overlay-new-shaped.md)。宿主座位拥有拖动、持久化、板内置顶和挂着不画（[异形拖动](2026-09-14-overlay-shaped-drag.md)，[异形隐藏](2026-09-14-overlay-shaped-hide.md)）。本笔记部分取代 [独立电视](2026-09-14-overlay-television-standalone-fiber.md)：宿主已经存在；省略 `overlayBody` 的包在改挂到 `overlay-shaped.body` 之前仍是独立 fiber。

## Alternatives considered

**把形状复用 `overlay-desktop.body`。** 否决 — 桌面是 `kind: 'single'`，会互斥关掉其它桌面。形状必须能共存。

**宿主自己画铬框或空状态文案。** 否决 — 只插入宿主时必须看起来像什么都没插；空白处点击穿透。

**同一变更里写成占用者 HOW。** 宿主变更否决 — 宿主是可复用画板。占用者插入/生成 HOW 在 [overlay 异形占用者生成](../process/2026-09-14-overlay-new-shaped.md)；挂着不画见 [异形隐藏](2026-09-14-overlay-shaped-hide.md)。拖动见 [异形拖动](2026-09-14-overlay-shaped-drag.md)。

**把产品 CRT 当宿主。** 否决 — 产品 fiber 不是 list 画板。

**占用 `root` 或 `overlay-card.body`。** 否决 — `root` 是 AppFrame；卡片是另一种已撰写形态。

**用隐藏文件卸下占用者。** 否决 — 挂着不画必须让 iframe 继续播（[异形隐藏](2026-09-14-overlay-shaped-hide.md)）。

## Consequences

只插入宿主时 overlay 画面不变。Cursor 轨不列出该宿主。声明 `overlay-shaped.body` 的占用者可以共存于同一块画板。新占用者走 [overlay 异形占用者生成](../process/2026-09-14-overlay-new-shaped.md)。省略 `overlayBody` 的包在迁移之前仍是独立的 `shell.overlay` fiber。

## Testing

`packages/client/ui-overlay-shaped/tests/` 固定 `shell.overlay` id `overlay-shaped`、order 180、穿透属性、没有空状态文案、`overlay-shaped.body` 上两个 list id、按 id 的座位，以及 inject `bodyIds`。`packages/client/modules/tests/node-half.client.spec.ts` 接受 `overlay-shaped.body`。`scripts/overlay-live-plugin.spec.ts` 固定缺少宿主、再次插入宿主、以及两个异形占用者都保持启用。`packages/client/ui-cursor-agent/tests/plugin-roster.spec.ts` 固定宿主不在列表、shaped `overlayBody` 列为 `shaped`。`packages/bundle/web-app/tests/lab-overlay-occupants.spec.ts` 把本包排除在默认名录外。拖动覆盖见 [异形拖动](2026-09-14-overlay-shaped-drag.md)。隐藏覆盖见 [异形隐藏](2026-09-14-overlay-shaped-hide.md)。
