# Agent Note: Overlay 卡片边缘标签

Status: implemented

[English](2026-09-07-overlay-card-edge-tag.md) | 中文

## Problem

操作者需要把卡片从可玩白板上清走，又不能动名册 `hidden` 或占用者 Loader `disabled`。那些标志会跳过或卸载窗口；之后再显示会重挂窗体。共享书签行是错误模型：每张已缩小的卡片都变成同一行里的标签，拖动一个标签（或整行）会把所有书签挪到同一个 `dockEdge`。卡片无法各自停在任意边、任意沿边位置。缩小必须把**那扇窗本身**收成标签，而不是在白板边缘再加一行容器。

## Decision

[`OverlayCard`](../../../../packages/client/ui-float-window/README.md) 在顶栏右侧、`overlay-card.chrome.trailing` 之后内置 **缩小**。那里的鼠标左键按下会按上次停靠的标签（`parks[seat]`）写入 `docks[seat]`；还没有停靠过时用 `dockFromFrame`（离顶栏最近的白板边，沿该栏在边上的投影）。卡片节点**就是**标签：`data-overlay-dock` / `data-overlay-dock-edge`，CSS `.tag`，`z-index` 基数 200。已停靠标签是同一条书签转到边上：短边 `TAG_THICKNESS` 32 贴着边缘，长边是标题伸进白板（`TAG_ALONG_MAX` 160）。左右是横条，上下是竖条。燕尾 V 口在伸进白板的自由端（`clip-path`，`TAG_NOTCH` 10）；贴边那头是平的并收进边缘。唯一 id 留在展开顶栏；标签只画标题，字体 `--dsw-font-xxxs-11`。静止时整条书签有 `TAG_TUCK`（短边的一半）落到白板外，白板裁掉一半；悬停朝白板平移 `TAG_PEEK`（`prefers-reduced-motion` 不做过渡）。毛玻璃只在 `.window:not(.tag)` 上；标签用 `backdrop-filter: blur(0)` 和 `--dsw-alias-bg-overlay`。拖动时用完整书签；拖离各边时用小圆角矩形。窗体、缩放手柄和右侧铬框用 `display: none`。窗口保持挂载，页面不重挂。上次展开的外框留在桌面 store。缩小和展开会把上一框倒扣到新框上（`flipInvert` / `flipToward`，`MORPH_MS` 320）。缩小飞行时保持展开铬框，飞向按标题量出的书签（`tagRibbonAlong`）；标签面交叉淡化在 `DISSOLVE_DELAY_MS` 120 开始，仍处于飞行（`MORPH_MS` 320）中，再经过 `SETTLE_MS` 320。落到 `.tag` 之前会先冻住最后一帧 FLIP 变换（`transition: none`），避免残留缩放在标签盒子上再播一遍；落地两帧内关掉标签悬停位移过渡，尺寸用画出来的书签长边。展开把标签倒扣进外框并交叉淡化回去。磁吸 `setDock` 不做变形。

[`OverlayDesk`](../../../../packages/client/ui-float-window/README.md) 只挂卡片窗口。没有 `OverlayBookmarkRail`，也没有共享的 `dockEdge`。每个已停靠座位是 `{ edge, along }`（`OverlayDock`）。拖动这个实体：窗口级 `pointermove` / `pointerup` / `pointercancel` 在节点因换边而重挂之后仍跟上这次手势。指针落在某条边的 `DOCK_MAGNET_RANGE` 内（小画布上是短边的四分之一）时，`magnetDock` 按指针的沿边位置把标签投影到那条边（`clampDockAlong`）。超出该范围时预览跟着手浮起。点击（移动小于 6px）会按上次展开的外框还原并把卡片置顶。没有磁吸的释放会把抓取原点写成新外框原点，再展开。`setDock` 更新已经停靠的座位和记住的停靠。

缩小是[可玩白板](2026-09-06-overlay-playable-board.md)上的观看铬框。它不写 `OverlayCardSpec.hidden`，也不写 Loader `disabled`（[隐藏与 Loader disabled](2026-09-07-overlay-card-hide-and-loader-disabled.md)）。已隐藏或已拔出的 spec 像保留外框一样保留停靠和停靠记忆，直到 spec 被删掉。`placeNewCard` 跳过已停靠的外框，标签不会把新窗口推到看不见的上次尺寸右边。`dsh.overlay-card.frames` 按唯一卡片 id 存可选的 `docks` 和 `parks`。`parks` 在展开后仍保留，之后的缩小回到那条边和沿边位置。带 `dockEdge` 和 `minimized` 的旧 blob 会把列出的每个 id 迁到那条共享边上（无效 `dockEdge` 视为顶边；没有外框时 `along: 0`），并用迁好的停靠填 `parks`。快照只在非空时写 `docks` 和 `parks`。空卡片原点 `y = 56` 落在典型收进半截的顶边标签下方（`TAG_TUCK` 16 落到白板外；书签按标题长度垂下来）。

操作 HOW 是 [dsh-overlay-web-plugins](../../../skills/dsh-overlay-web-plugins/SKILL.md)。相关记录：[overlay-card 容器](2026-09-05-overlay-card-container.md)、[overlay 叠放](2026-09-07-overlay-stack-and-card-plug.md)。

## Alternatives considered

**一条共享书签行（`OverlayBookmarkRail`，所有标签共用一个 `dockEdge`）。** 否决 — 拖动一个标签会带走所有书签。缩小必须把那张卡收成自己的标签，各自停靠。先前的书签行决策已归档在 [书签坞](../../archived/architecture/2026-09-07-overlay-card-bookmark-dock.md)。

**把缩小做成 trailing 槽占用者。** 否决 — 每张卡都需要同一个控件，页面占用者还可以不装。停靠是可复用卡片的默认铬框。

**停靠时卸载窗体。** 否决 — 重挂会丢掉页面本地的 React 状态。隐藏已经会卸载；缩小不能。

**把坞状态写入 `instances.json`。** 否决 — 该文件是插入时的名册加上 `hidden` 和 `occupants`。按卡记录的边和沿边位置是观看几何，因此与 `dsh.overlay-card.frames` 共用。

**用 `hidden` 表示缩小。** 否决 — 隐藏是插件浮层的跳过；显示会重挂。缩小必须保持窗体挂载，也不能改 Cursor 轨上的「隐藏」标签。

**远离各边放下时仍用上次展开外框。** 否决 — 远离各边放下的意思是在此处展开。点击（移动小于 6px）仍按上次展开的外框还原。

**每次缩小都按展开外框重算标签。** 否决 — `parks` 记住上次磁吸或第一次停靠，缩小回到那条边和沿边位置。

## Consequences

卡片可以收成自己的标签离开白板，停在任意边的任意沿边位置，不必隐藏、拔出，也不必由页面写控件。其它已停靠的卡片留在原地。窗体保持挂载。页面刷新会恢复按卡停靠、停靠记忆和外框。清除站点数据后回到插入时的摆放，没有标签。产品 trailing 占用者仍是额外控件；它们不替代缩小。

## Testing

`packages/client/ui-float-window/tests/geometry.spec.ts` 钉住最近边停靠、沿边位置磁吸、远处指针不磁吸、收进半截与完整的 `dockTagBox`，以及 `tagRibbonAlong`、`flipInvert`、`flipToward` 和 `tagFlipBox`。`tests/frame-storage.client.spec.ts` 往返 `docks` 和 `parks`，并迁移旧的 `dockEdge` / `minimized`。`tests/overlay-card.client.spec.tsx` 钉住缩小、收进半截的静止原点、燕尾和悬停探出 CSS、点击按上次外框展开、远离各边放下在释放点展开、缩小回到上次停靠、缩小变形先以卡片飞行再溶解成标签、拖动标签磁吸到另一条边（含 window 级指针事件）、持久化、隐藏仍保留停靠、`placeNewCard` 跳过已停靠邻居，以及 ResizeObserver 断开。已知缺口：没有对着现场 overlay 原点做自动化指针拖动；现场核验是缩小（以卡片飞行，接近落点再交叉淡化成标签）、悬停半截标签、把它拖到另一条边的选定沿边位置、点击按上次外框展开，再远离各边放下在落点展开。
