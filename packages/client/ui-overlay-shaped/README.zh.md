# @deepseek-ai/dsh-client-ui-overlay-shaped

[English](README.md) | 中文

可复用 overlay **异形基模**（任意形状呈现形态）：铺满视口、全透明可穿透的一层，挂在 `shell.overlay` 上、垫在卡片之下、叠在桌面和 Cursor 之上。浏览器半端把 `ShapedBoard` 注册为 id `overlay-shaped`、order 180（永不 `root`，永不 `cursor-agent`，永不 `overlay-card.body`，永不 `overlay-desktop.body`）。根节点带 `data-overlay-board` 和 `pointer-events: none`，壳层因此保持空白处穿透。只插入本包时什么也不画：没有铬框，没有空状态文案。本板不加入 `ctx.overlayStack`。宿主座位包裹每个 `overlay-shaped.body` list id：拖动、持久化偏移（`localStorage` `dsh.overlay-shaped.offsets`）、板内置顶、挂着不画（`hidden.json`，CSS `visibility: hidden`），以及把占用者轴对齐包围盒留在可玩画板内。唯一子槽是 `overlay-shaped.body`（`kind: 'list'`）。可以同时启用多个占用者 Loader fiber。节点半端是空的 Loader 座位。默认 web-app 名录不挂载本包。

`/client` 导出插件本体（`apply` / `inject`）。画板组件留在包内。占用者包对 `@deepseek-ai/dsh-client-ui-overlay-shaped/client` 做类型导入以拿到 `SlotMap`，绝不值导入 `ShapedBoard`。

## 使用

先插入本包，再占据 `overlay-shaped.body`。不要把本树拷进产品包。占用者插入是 `pnpm overlay:new-shaped <name>`（[dsh-overlay-shaped-plugins](../../../.agents/skills/dsh-overlay-shaped-plugins/SKILL.md)）。再次插入本包是空操作（基模已经装上）。刷新 `lib/` 用 `pnpm overlay:live update packages/client/ui-overlay-shaped`。

```sh
pnpm overlay:live insert packages/client/ui-overlay-shaped
```

页面插件类型导入 `@deepseek-ai/dsh-client-ui-overlay-shaped/client`，注册进 `overlay-shaped.body`，自带 id。页面包声明 `dsh.client.overlayBody: overlay-shaped.body`，以便 `overlay:live insert` 要求本宿主存在，并把占用者列为 Cursor 轨上的 `shaped` 行。再插入另一个异形占用者是追加，不会互斥禁用已有占用者。占用者操作 HOW 是 [dsh-overlay-shaped-plugins](../../../.agents/skills/dsh-overlay-shaped-plugins/SKILL.md)。

## 模型体验

无：可复用 overlay 异形基模只是浏览器占用者，不向模型注册任何内容。

#### KV 缓存影响

无；本包既不组装也不发送 Provider 请求。

## 已知限制与暂缓事项

- **不得占用 `root`，不得复用 `cursor-agent`、`overlay-card.body` 或 `overlay-desktop.body`** —— `root` 会盖住 AppFrame；`cursor-agent` 是 Cursor overlay 面板；卡片和桌面是另外两种已撰写形态。
- **`overlay-shaped.body` 是 `kind: 'list'`** —— 该 fiber 插入期间可以有多个占用者。后插入的不会禁用前一个。
- **没有空状态文案** —— 只插入宿主时必须看起来像什么都没插。空白处点击穿透。
- **穿透画板** —— 宿主根保持 `pointer-events: none`。宿主座位也是 `none`。需要命中的产品在自己的轮廓上打开指针事件。宿主 Pointer Capture 在 `SHAPED_CLICK_SLOP`（6px）之后才开始，占用者 `onClick` 因此仍能触发（[异形拖动](../../../.agents/notes/implemented/architecture/2026-09-14-overlay-shaped-drag.md)）。占用者按钮点不着时，对这个包做 `overlay:live update`；不要在 Occupant 里加拖动或 `onPointerDown`。
- **不出现在轨上** —— Cursor 插件栏不列出 `ui-overlay-shaped`。占用者行（`overlay-shaped.body`）提供隐藏/显示和插入/拔出（[异形隐藏](../../../.agents/notes/implemented/architecture/2026-09-14-overlay-shaped-hide.md)）。卡片侧的隐藏/拔出仍不得禁用这个 Loader id。卸载画板用 `overlay:live remove`。
- **占用者 HOW** —— 插入/生成是 `pnpm overlay:new-shaped`。保留生成的 `onClick`。宿主座位拥有拖动、持久化、板内置顶、挂着不画，以及把占用者包围盒留在可玩画板内（[异形拖动](../../../.agents/notes/implemented/architecture/2026-09-14-overlay-shaped-drag.md)，[异形隐藏](../../../.agents/notes/implemented/architecture/2026-09-14-overlay-shaped-hide.md)）。线格与命中层共用一个内尺寸（主题 `border-box` 会让 `border` 吃掉内容盒）。
