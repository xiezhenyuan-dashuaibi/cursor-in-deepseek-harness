# @deepseek-ai/dsh-client-ui-float-window

[English](README.md) | 中文

可复用的 overlay **卡片桌面**（卡片窗口呈现形态）：`shell.overlay` 上可拖动、可拉边缩放的窗口。浏览器半把 `OverlayDesk` 注册为 id `overlay-card`（不是 `root`，也不是 `cursor-agent`）。顶栏最左侧是名称再跟编号（`--title` / `--card-id`；编号是唯一 id，不是槽座位）；顶栏叠在窗体上，下沿渐变到透明；右侧控件占据该卡片的 list；内置 **缩小** 把该窗口收成上次停靠边上的标签（第一次缩小用最近白板边）。标签只显示标题。左右是横条，上下是竖条，V 口在伸进白板的自由端。静止时贴边的一半在白板外，悬停朝白板探出一点。拖动这个标签：靠近某条边时会按该沿边位置磁吸过去。点击标签会按上次展开的外框还原；放到距每条边都超出磁吸范围处，会在释放点展开。缩小以卡片铬框飞向标签，接近落点再与标签面交叉淡化；展开时从标签交叉淡化回外框。缩小保持窗体挂载，不是名册 `hidden`。悬停展开卡片的顶栏保持默认光标（不是抓手）；已停靠标签使用抓手。四边缩放只命中外侧 4px 条，窗体滚动条仍可点；四角仍是 12px。窗口内任意处的鼠标左键按下会把该卡片在桌面内置顶，并把整张桌面在 `ctx.overlayStack` 里抬到 Cursor 对话窗前面。白板使用 `isolation: isolate`，卡片 `z-index` 不与 Cursor 窗竞争。每个窗体是页面插件：产品标题、主按钮和视场写在那里。外框在 register 声明的桌面 store 里，并写入 `localStorage`（`dsh.overlay-card.frames`），页面刷新后仍在。插入时的 `--title` / `--card-id` / `--width` / `--height` 写入 `instances.json`（默认 `卡片`、下一个座位的十进制 id、360×280）。`hidden: true` 的 spec 留在该文件里，供 Cursor 轨插件管理器列出；桌面只在 spec 未隐藏且占用者 fiber 已插入时挂窗口。节点半从 `instances.json` 和现场 profile patch 提供 `instances.list`、`instances.setHidden` 和 `occupants.setInserted`。新挂上的卡片放在当前最右侧窗体的右边；那会离开可玩白板时改与默认原点重叠。拖动和 `preferFrame` 让顶栏抓条留在白板上（高 36px、宽 120px）；窗体可以探出左缘、右缘或底缘，由 overlay 层裁掉。之后 `preferFrame`、拖动和缩放只改那一张的外框。同文档的 `#id` 链接只在该窗体内解析；CSS `#id` 和 `getElementById` 是文档全局的，所以窗体按元素的 `id` 属性在后代里查找，并只改该窗体内滚动层的偏移。不会打到另一扇窗。没有页面占用者的窗体槽显示实底的「空卡片」。`preferFrame` 省略 `x` / `y` 则保留当前原点。座位 1 占据 `overlay-card.body`；座位 N 占据 `overlay-card-N.body`。页面插件通过 `ctx.slots.inject` 占据窗体槽；本包不 import 那个页面。带大顶栏的品牌铬框是改本包里的 `OverlayCard`。

`/client` 导出插件体（`apply` / `inject`）、`overlay-card` 文案键联合、`overlayCardBodySlot`，以及 `preferFrame` / trailing 的 owner 类型。卡片组件留在包内。npm 路径仍是 `ui-float-window`；占用者身份是 `overlay-card`。

## Use

插入本包，再占据 `overlay-card.body`。不要把本树复制进产品包。用 `pnpm overlay:new-page <name>` 写页面包；不要克隆另一个占用者或本卡片。`--id` 是 Loader 目录 id，不是卡片唯一 id。

```sh
pnpm overlay:live insert packages/client/ui-float-window --title 卡片 --card-id 1 --width 360 --height 280
pnpm overlay:live insert packages/client/ui-float-window --title 草稿 --card-id draft --width 520 --height 400
pnpm overlay:live remove overlay-card-draft
```

第一次插入在省略标志时挂上 `卡片 1`、360×280。该插入还会在 profile 还没有 overlay-card RPC 行时写入 `./overlay-card-roster-rpc.mjs`，因此即使本进程已经缓存了 npm 包的 `apply`，`/overlay-card` 仍能挂上；并写入 `./overlay-card-plug-rpc.mjs`，以便在第一次 `/overlay-card` 仍是只读 list 时也能挂上隐藏和插入写入。之后再插入本包会追加下一条 spec，不会再写第二行 Loader，也不会再复制 `lib/`。`remove overlay-card-<id>` 去掉那扇窗。`remove ui-float-window`（或该 Loader id）卸载整张桌面。页面插件为 `SlotMap` type-import `@deepseek-ai/dsh-client-ui-float-window/client`，并注册进 `overlay-card.body`（或 `overlay-card-N.body`）。页面包声明 `dsh.client.overlayBody`，以便 `overlay:live insert` 记录占用。操作 HOW：[dsh-overlay-web-plugins](../../../.agents/skills/dsh-overlay-web-plugins/SKILL.md)。

## Model Experience

None, as the reusable overlay card is a browser occupant plus a roster RPC and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **外框只存在于本浏览器** — `x` / `y` / `width` / `height`、桌面叠放、按卡边缘标签和上次停靠写入 `localStorage`（`dsh.overlay-card.frames`），只对当前源有效。清除站点数据后回到插入时的摆放且没有标签，页面仍可调用 `preferFrame`。`instances.json` 仍只拥有插件名册，不是现场几何。
- **不得占据 `root` 或复用 `cursor-agent`** — `root` 会盖住 AppFrame；`cursor-agent` 是 Cursor overlay 面板。
- **每个窗体槽都是 `kind: 'single'`** — 一张卡片一个页面占用者。要换产品就卸载或替换该卡片上的页面插件。
- **右侧铬框按卡片分开** — 给内置缩小旁边的额外控件的 list 槽。那里的指针事件不会开始拖动，但仍会把窗口置顶。没有占用者时该区域空白。缩小是 OverlayCard 铬框，不是这个槽。
- **插入标志不是 Loader `config`** — `overlay:live` 仍只写 Loader `{ id, name }`；标题、唯一 id 和开场尺寸在 `instances.json`。页面 `preferFrame` 仍可在首次挂载时改尺寸；已存储的外框或用户拖动/缩放会忽略之后的调用。
- **现场 `/overlay-card` 走 profile 相对模块** — Node 会缓存本包名的第一次 `apply`。`overlay:live insert` 或 `update` 在 profile 还没有 overlay-card RPC 行时写入 `./overlay-card-roster-rpc.mjs`，并写入 `./overlay-card-plug-rpc.mjs`，以便第一次 `/overlay-card` 仍是只读 list 时，`instances.setHidden` 和 `occupants.setInserted` 能挂上 `/overlay-card-plug`。卡片 `update` 在第一个 plug-rpc URL 已被缓存时，会把该 Loader `name` 改到 `./overlay-card-hide-rpc.mjs`。source launch 本包时读现场 `plugins/*/instances.json`，不是 checkout 里默认的一张卡片。
- **窗体槽随名册增长** — OverlayDesk 按块（8、16、32、…）预先声明 `overlay-card.body` 和 `overlay-card-N.body`（N ≥ 2）。跨过一块会重挂桌面，页面重新 inject。`remove overlay-card-<id>` 之后座位不复用。
- **隐藏保留 spec；拔出保留现场副本** — `hidden: true` 跳过窗口。占用者 `disabled: true` 暂停该 Loader fiber。两者都不删除 `instances.json` 行或 checkout 包。插件浮层不调用 `overlay:live remove`。
