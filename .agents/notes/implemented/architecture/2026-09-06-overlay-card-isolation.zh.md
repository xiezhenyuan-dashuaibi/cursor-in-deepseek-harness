# Agent Note: Overlay 卡片隔离外框与卡内 hash 导航

Status: implemented

[English](2026-09-06-overlay-card-isolation.md) | 中文

## Problem

多张 overlay 卡片共用一份文档和一张桌面 store。页面 `preferFrame` 或缩放若与另一扇窗重叠，会改写那张兄弟的 `x` / `y`。同文档的 `a[href="#id"]` 走文档全局 hash 导航，所以在一个窗体里点击可能滚到另一扇窗里第一个同名 id。产品页面跨插件通信走 Connection RPC 和 Cordis 服务；桌面不得把几何或 DOM id 当成第二条通道。

## Decision

插入之后每个座位的外框是私有的。`setFrame`（页面 `preferFrame` 和边框缩放）和 `setPosition`（顶栏拖动）只改被点名的座位。新挂上的座位仍放在当前最右侧窗体的右边；那会离开可玩白板时改与默认原点重叠（[可玩白板](2026-09-06-overlay-playable-board.md)）。之后允许重叠；用户要挪窗就拖那一扇。

窗体拦截同文档 hash 点击（`href` 以 `#` 开头）。解析按元素的 `id` 属性遍历该窗体后代，不用 `document.getElementById`，也不用 CSS `#id` 选择器（两扇窗复用同一 id 时两者都是文档全局的）。命中的元素只靠调整仍在该窗体内的最近 overflow 祖先的 `scrollTop` / `scrollLeft` 进入视场；不用 `Element.scrollIntoView`，因为它会滚 overlay 祖先，屏幕上其它窗口也会跟着动。id 不在本窗时仍 `preventDefault`，文档不能跳到另一扇窗。

跨卡数据仍走 Connection RPC 和 Cordis 服务。桌面 store 只管家窗口几何。卡片铬框、插入标志和名册格式仍由 [overlay 卡片容器](2026-09-05-overlay-card-container.md) 拥有。

## Alternatives considered

**在 `preferFrame` 和缩放时继续推移重叠的兄弟。** 否决 — 一张页面上的点击或挂载 effect 会移动另一产品的窗口。那不是 RPC 或 Cordis 调用。

**对卡内目标调用 `Element.scrollIntoView`。** 否决 — 该 API 会滚每一层可滚动祖先，包括 overlay 画布，所以即使 store 外框没变，屏幕上其它窗口也会动。

**每个窗体用 iframe 或 shadow root。** 否决 — 此路径上页面插件是同一文档里 `overlay-card-N.body` 的 React 占用者；iframe 会丢掉 slot、locale 和 Connection。hash 捕获加按座位外框是这条路径能保住的隔离。

**只靠每个页面包自己保证 id 唯一。** 否决为唯一钉子 — 占用者会复用 `book` / `packages`。隔离边界是卡片窗口。

## Consequences

窗口可以重叠。插入仍把新的空卡片放到已有卡片旁边；那会离开可玩白板时改与默认原点重叠。页面 `preferFrame` 省略 `x` / `y` 时保留用户拖过的原点。页内 hash 导航留在该卡片里。产品插件不为 UI 互相 import。

## Testing

`packages/client/ui-float-window/tests/overlay-card.client.spec.tsx` 钉住缩放座位 1 时座位 2 的外框不变，以及窗体 `#id` 点击不会对其它根调用 `scrollIntoView`。`tests/hash.client.spec.ts` 钉住在 `document.getElementById` 已指向另一个根时仍做窗体内解析、只改本窗体内滚动偏移（含页面自己的 overflow 根），以及本地缺失的 hash 仍取消默认导航。已知缺口：没有对着正在跑的 overlay 做两个现场插件的点击测试；合同钉在这些单元测试上。
