# Agent Note: Overlay 可玩白板裁剪卡片；顶栏留在白板上

Status: implemented

[English](2026-09-06-overlay-playable-board.md) | 中文

## Problem

Overlay 卡片与兄弟占用者共用 `shell.overlay`。原点钳位以前只保证 `x >= 0`、`y >= 0`，所以拖动和插入可以把顶栏停到涂白 overlay 的右缘或底缘之外。外壳外框已经 `overflow: hidden` 且没有滚动条，窗体离开盒子就会消失，名册规格却仍挂着。`placeNewCard` 把后到的座位叠在最右窗体下面，第四张卡片就是这样离开画布的。指针计算用 `window.innerWidth` / `innerHeight`，有分栏或 Cursor 面板时那并不是 overlay 盒子。

## Decision

可玩白板是 overlay 层的盒子，不是浏览器窗口。

[`ui-layout`](../../../../packages/client/ui-layout/README.md) 的 `AppFrame` `.overlayLayer`（`data-shell-overlay`）四面裁剪占用者（`overflow: hidden`），层本身仍点击穿透。直接子节点自行恢复指针事件，但 `[data-overlay-board]` 除外，这样全幅裁剪板不会抢走兄弟 overlay 条目的空白命中。[`ui-cursor-agent`](../../../../packages/client/ui-cursor-agent/README.md) 给同一节点涂底（`background: var(--dsw-alias-bg-base)`）并同样裁剪 overflow。这仍是 `shell.overlay`，不是预留的整页画板形态。

[`OverlayDesk`](../../../../packages/client/ui-float-window/README.md) 用一块板包住卡片（`position: absolute; inset: 0; overflow: hidden; pointer-events: none`），并打上 `data-overlay-board`。卡片的 `left` / `top` 相对这块板。`ResizeObserver` 把板的尺寸写入桌面 store 并重新钳每个原点。拖动把 `clientX` / `clientY` 经板的 `getBoundingClientRect()` 换算。

抓条钳位：`x` 落在 `[120 - width, canvas.width - 120]`，`y` 落在 `[0, canvas.height - 36]`（`TITLE_BAR_HEIGHT` 与 36px 顶栏一致）。顶栏通栏，所以向左探出时白板上仍留着顶栏右端。窗体可以探出左缘、右缘或底缘；CSS 裁掉探出的像素。`setFrame` / `setPosition` / `preferFrame` 都走这条钳位。新挂上的座位仍放在当前最右侧已展开窗体的右边；那会离开白板时改与默认原点（`36, 56`，在典型顶边[标签](2026-09-07-overlay-card-edge-tag.md)下方）重叠，而不是叠到画布下面。插入之后仍允许重叠（[隔离](2026-09-06-overlay-card-isolation.md)）。

## Alternatives considered

**把整张卡片锁在视口里。** 否决——页面 `preferFrame` 可以要一块比 overlay 盒子更大的尺寸（卡片最小 360×280；产品页常常更大）。锁整框会和那个尺寸对着干。

**左边仍锁 `x >= 0`、只许探出右边。** 否决——顶栏已经通栏。左边留 120px 重叠仍是顶栏铬框（栏的右端），向左探出不必再做第二只把手。

**给 overlay 层 `overflow: auto`。** 否决——滚动白板会把每张卡片一起带走，等于取消按座位隔离。

**只在 `ui-float-window` 里用 `window.innerWidth` 钳。** 否决——overlay 盒子不是窗口，片段桌面也没有自己的包含块。停在涂白板之外的卡片照样消失。

**占据 `root` 或发明整页画板 HOW。** 否决——这里的白板就是现有的 `shell.overlay` 层。整页画板技能是预留槽。

## Consequences

卡片可以探出左缘、右缘或底缘，仍能靠顶栏抓回来。后插入的窗口右边放不下时，与已有卡片在默认原点重叠，而不是离开白板。overlay 缩小会重新钳原点，先前出界的窗口会回来。白板空白仍把点击让给兄弟 overlay 占用者；Cursor 面板仍在 overlay 层上涂色并接收命中。

## Testing

`packages/client/ui-float-window/tests/geometry.spec.ts` 钉住抓条钳位（含向左探出），以及缩放可以探出白板。`tests/overlay-card.client.spec.tsx` 钉住两侧拖过边缘、右边空隙会离开白板时的重叠放置、白板缩小后的再钳，以及桌面的 `data-overlay-board` 节点。`packages/client/ui-layout/tests/app-frame.client.spec.tsx` 钉住 `.overlayLayer` 的 overflow 裁剪和 `[data-overlay-board]` 例外。已知缺口：没有对着现场 overlay 原点做自动化指针拖动；现场核验是拖顶栏，停住时顶栏仍在涂白板上。
