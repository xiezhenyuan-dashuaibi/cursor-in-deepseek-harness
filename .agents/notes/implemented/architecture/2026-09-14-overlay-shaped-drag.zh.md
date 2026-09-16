# Agent Note: Overlay 异形座位拥有拖动、偏移持久化和板内置顶

Status: implemented

[English](2026-09-14-overlay-shaped-drag.md) | 中文

## Problem

可复用异形画板（[异形宿主](2026-09-14-overlay-shaped-host.md)）把并存的 `overlay-shaped.body` 占用者画在各自 CSS 静止位上。需要挪动的占用者要么在产品代码里自己写指针运算，要么停在未撰写的 HOW 后面。产品自己做拖动会在各个剪影里重复，和占用者的 `pointer-events` 打架，也没有共享的持久化键。加入 `ctx.overlayStack` 会把整块画板抬到卡片之上。节点 `instances.json` 持久化会错过浏览器半端 HMR，因为宿主 `apply` 在进程生命周期内被缓存。

## Decision

[`ui-overlay-shaped`](../../../../packages/client/ui-overlay-shaped/README.md) 给每个 `overlay-shaped.body` list id 包一层宿主 `ShapedSeat`。座位是 `position: absolute; inset: 0; pointer-events: none`，带 `transform: translate(x, y)`。占用者 CSS 保持静止位。命中落在占用者 `pointer-events: auto` 的目标上，再经座位冒泡。主键移动超过 `SHAPED_CLICK_SLOP`（6px）是拖动；更小的移动仍是点击。指针捕获在走出 slop 之后才开始，占用者的 `click` 仍能触发；拖动结束后的那次残留 click 会被吞掉。偏移持久化在浏览器 `localStorage` 键 `dsh.overlay-shaped.offsets`（`{ [listId]: { x, y } }`）。占用者画出来的包围盒留在可玩画板内（`ResizeObserver` 看 `[data-overlay-board]`；比画板还大的剪影钉在画板原点）。座位测量会跨过 `display: contents` 的槽位锚点——那些节点的边框盒是视口原点上的 0×0，不是剪影。置顶是座位之间的板内 `z-index`。画板仍不加入 `ctx.overlayStack`。占用者包不实现拖动。挂着不画由宿主拥有（[异形隐藏](2026-09-14-overlay-shaped-hide.md)）：占用者轨上行提供隐藏加拔出；宿主行只保留拔出。

操作 HOW：[dsh-overlay-shaped-plugins](../../../skills/dsh-overlay-shaped-plugins/SKILL.md)。占用者骨架：[overlay 异形占用者生成](../process/2026-09-14-overlay-new-shaped.md)。形态划分：[形态 skill](../process/2026-09-05-overlay-frontend-form-skills.md)。

## Alternatives considered

**在 `Occupant.tsx` 里由占用者自己拖动。** 否决 — 每个剪影都要重写 slop、持久化和叠放；画面独立禁止把兄弟占用者当模式来抄。

**占用者 `onPointerDown` 或占用者 `setPointerCapture`，只因为按钮点不着。** 否决 — 推迟的宿主 Pointer Capture 才是点击契约；占用者 pointerdown 是在给 pointer-down 就捕获的座位打补丁。恢复办法是对 `ui-overlay-shaped` 做 `overlay:live update`。

**加入 `ctx.overlayStack`，让异形命中抬到卡片之上。** 否决 — 画板仍垫在卡片桌之下（order 180 对 220）。置顶只在异形座位之间。

**持久化到节点 `instances.json` / overlay-card RPC。** 否决 — 宿主 `apply` 在进程生命周期内被缓存；浏览器半端 HMR 能拿到 `client.js`，`localStorage` 在那次重挂后仍在，不必绕一圈 Node。

**像卡片 `clampGrabOrigin` 那样只留抓手在画板上。** 否决 — 异形座位没有标题栏。占用者包围盒整块留在可玩画板内。比画板还大的剪影钉在画板原点。

**由宿主改写占用者 CSS 静止位。** 否决 — 产品拥有轮廓落点；宿主只加像素偏移。

## Consequences

对宿主做一次现场 `overlay:live update`，每个 `overlay-shaped.body` 占用者都能拖，不必改该占用者的 `Occupant.tsx`。占用者 `onClick` 是交互契约：slop 之内的行程仍必须触发占用者 click。空白处、卡片、桌面和 Cursor 仍可点穿。挂着不画见 [异形隐藏](2026-09-14-overlay-shaped-hide.md)。像 [电视](2026-09-14-overlay-television-standalone-fiber.md) 这样的独立 `shell.overlay` fiber 不坐在座位里，收不到这层包裹。

## Testing

`packages/client/ui-overlay-shaped/tests/` 固定点击 slop、推迟指针捕获好让子按钮的 `click` 仍能触发、拖动结束后吞掉残留 click、偏移解析、`localStorage` 往返、body-id 快照复用、按 id 的 `renderSlot` `only`、板内置顶、指针走过 slop 之后的持久化，以及占用者包围盒留在可玩画板内（含画板缩小后的重钳，以及 `display: contents` 槽位锚点的测量）。隐藏覆盖见 [异形隐藏](2026-09-14-overlay-shaped-hide.md)。
