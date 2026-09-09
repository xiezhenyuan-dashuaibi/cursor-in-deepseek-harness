# Agent Note: Overlay 卡片书签坞

Status: implemented
Archived: 2026-09-07

[English](2026-09-07-overlay-card-bookmark-dock.md) | 中文

## Problem

操作者需要把卡片从可玩白板上清走，又不能动名册 `hidden` 或占用者 Loader `disabled`。那些标志会跳过或卸载窗口；之后再显示会重挂窗体。白板顶部已经给一行标签留了空（空卡片原点 `y = 56`），但卡片铬框没有控件把窗口停到那里。右侧 list 曾被写成缩小占用者的孔；实际没有实现，每个页面都得自己再做一遍停靠。

## Decision

[`OverlayCard`](../../../../packages/client/ui-float-window/README.md) 在顶栏右侧、`overlay-card.chrome.trailing` 之后内置 **缩小**。那里的鼠标左键按下会把该座位停到坞上。窗口保持挂载：`hidden` 加上 `.docked { display: none }` 藏起外框，窗体不重挂。上次展开的外框留在桌面 store。

[`OverlayDesk`](../../../../packages/client/ui-float-window/README.md) 在任一已挂座位已缩小且有铬框身份时，画一条书签行（`OverlayBookmarkRail`，`data-overlay-dock`，`z-index: 200`）。标签是 `{title} {id}` 文字。书签行默认停在 **顶** 边。拖动某个标签或整行时，指针靠近某条白板边就把整行磁吸过去（`top` / `right` / `bottom` / `left`；打平时优先顶、再底、再左、再右）。点击，或放到白板内侧（`DOCK_RESTORE_INSET`，小画布上是四分之一），会按上次外框展开该卡并置顶。窗口级指针监听在书签行跳到另一条边之后仍跟上这次手势。展开不会把放下点写成新原点。

缩小是[可玩白板](2026-09-06-overlay-playable-board.md)上的观看铬框。它不写 `OverlayCardSpec.hidden`，也不写 Loader `disabled`（[隐藏与 Loader disabled](2026-09-07-overlay-card-hide-and-loader-disabled.md)）。已隐藏或已拔出的 spec 像保留外框一样保留缩小标志，直到 spec 被删掉。`placeNewCard` 跳过已停靠的外框，书签不会把新窗口推到看不见的上次尺寸右边。`dsh.overlay-card.frames` 存可选的 `dockEdge` 和 `minimized`（仍有存储外框的唯一卡片 id）。旧 blob 省略这些字段，表示顶边、没有书签。

操作 HOW 是 [dsh-overlay-web-plugins](../../../skills/dsh-overlay-web-plugins/SKILL.md)。相关记录：[overlay-card 容器](2026-09-05-overlay-card-container.md)、[overlay 叠放](2026-09-07-overlay-stack-and-card-plug.md)。

## Alternatives considered

**把缩小做成 trailing 槽占用者。** 否决 — 每张卡都需要同一个控件，页面占用者还可以不装。停靠是可复用卡片的默认铬框。

**停靠时卸载窗体。** 否决 — 重挂会丢掉页面本地的 React 状态。隐藏已经会卸载；缩小不能。

**把坞状态写入 `instances.json`。** 否决 — 该文件是插入时的名册加上 `hidden` 和 `occupants`。书签边和已缩小 id 是观看几何，因此与 `dsh.overlay-card.frames` 共用。

**每张卡一个坞，而不是一条书签行。** 否决 — 白板顶是一行书签，由用户停到某条边上。按卡分坞会让边互相冲突。

**用 `hidden` 表示缩小。** 否决 — 隐藏是插件浮层的跳过；显示会重挂。缩小必须保持窗体挂载，也不能改 Cursor 轨上的「隐藏」标签。

**在放下点展开。** 否决 — 内侧放下的意思是「展开」，不是「放到这里」。上次展开的外框才是用户已经摆好的窗口。

## Consequences

卡片可以收成书签离开白板，不必隐藏、拔出，也不必由页面写控件。窗体保持挂载。页面刷新会恢复书签边以及哪些唯一 id 是书签。清除站点数据后回到插入时的摆放，没有书签。产品 trailing 占用者仍是额外控件；它们不替代缩小。

## Testing

`packages/client/ui-float-window/tests/geometry.spec.ts` 钉住边吸附和内侧放下展开。`tests/frame-storage.client.spec.ts` 往返 `dockEdge` / `minimized`，并跳过没有外框的已停靠 id。`tests/overlay-card.client.spec.tsx` 钉住缩小、点击和内侧放下展开、拖动标签磁吸到另一条边（含 window 级指针事件）、书签行吸附（含没有 pointer capture 的 pointer-up）、持久化、隐藏仍保留缩小、`placeNewCard` 跳过已停靠邻居，以及 ResizeObserver 断开。已知缺口：没有对着现场 overlay 原点做自动化指针拖动；现场核验是缩小、把标签拖到另一条边，再点击或向内侧放下标签。
