# Agent Note: 可复用 overlay 卡片作为默认前端容器

Status: implemented

[English](2026-09-05-overlay-card-container.md) | 中文

## Problem

overlay 前端工作应当是「写页面」。当卡片铬框带着某一个产品的标题和默认尺寸时，下一个产品要么看起来像那个产品，要么自己占据 `shell.overlay`，再实现一遍顶栏拖动和八边缩放。第二扇窗就是昂贵路径：铬框无法复用，可视化包也变成了窗口插件。

## Decision

[`@deepseek-ai/dsh-client-ui-float-window`](../../../../packages/client/ui-float-window/README.md) 就是可复用 overlay 卡片桌面。浏览器半以 id `overlay-card`（order 220）占据 `shell.overlay`，并声明窗体槽 `overlay-card.body`（座位 1）以及 `overlay-card-N.body`（N ≥ 2），外加对应的右侧 list。OverlayDesk 按名册高水位以 8、16、32、… 为块预先声明这些键，因此插入没有张数上限：在当前块内加卡不会重挂已有窗口；跨过一块会重挂桌面，页面重新 inject。`remove overlay-card-<id>` 之后座位不复用。顶栏最左侧是插入时 `--title` / `--card-id` 的名称和编号（默认 `卡片` 和座位的十进制字符串，因此第一张仍读作 `卡片 1`）。编号是唯一 id，不是槽座位。顶栏高 36px，叠在窗体上，下沿渐变到透明。身份文字仍用现有的 13px 铬框字体。右侧控件占据该卡片的 list，不会开始拖动。内置 **缩小**（在该 list 右边）把该窗口收成边缘标签（[边缘标签](2026-09-07-overlay-card-edge-tag.md)）。窗口内任意处（顶栏、窗体、右侧铬框或缩放手柄）的鼠标左键按下会把该卡片在桌面内置顶，并把整张桌面在 `ctx.overlayStack` 里抬起（[overlay 叠放](2026-09-07-overlay-stack-and-card-plug.md)）。白板使用 `isolation: isolate`，卡片 `z-index` 留在桌面内。悬停顶栏保持默认光标（不是抓手）；缩放手柄保持缩放光标。四边缩放柄仍占 8px 布局盒，只在外侧 4px 条接收指针事件，因此同一边上 8px 主题滚动条仍可点；四角保持完整 12px 命中。窗体是独立网页：产品标题、主按钮和视场写在页面占用者里。外框留在一张桌面 store，并按唯一卡片 id 写入 `localStorage`（`dsh.overlay-card.frames`），页面刷新后仍在；`instances.json` 仍只拥有名册，不是现场几何。插入 `--width` / `--height` 设定首次挂载尺寸（默认 360×280，即卡片最小值）。新挂上的卡片放在当前最右侧窗体的右边；那会离开可玩白板时改与默认原点重叠，让顶栏留在白板上（[可玩白板](2026-09-06-overlay-playable-board.md)）。之后 `preferFrame`、拖动和缩放只改那一张的外框。同文档的 `#id` 链接只在该窗体内解析（[隔离](2026-09-06-overlay-card-isolation.md)）。没有页面占用者的窗体槽显示实底的「空卡片」。页面仍可在首次挂载时调用 `preferFrame`；省略 `x` / `y` 则保留当前原点。已存储的外框、第一次 adopt 或用户拖动/缩放之后，后来的 `preferFrame` 不再改窗口。`preferFrame` 的函数身份稳定，页面的挂载 effect 不会重建该回调。暂停这类观看标记是页面本地的 React 状态。带大顶栏的品牌铬框是改本包里的 `OverlayCard`。

节点半从现场插件副本旁的 `instances.json` 和现场 profile patch 提供 `/overlay-card` 上的 `instances.list`、`instances.setHidden` 和 `occupants.setInserted`。`rpc.handle` 从 `apply` 直接调用（它已经拥有这条路由的 effect）。名册每一项是一条 `OverlayCardSpec`（`seat`、`id`、`title`、`width`、`height`，以及可选的 `hidden` 和 `occupants`）。`hidden: true` 把 spec 留在文件里且桌面不挂载；占用者 fiber 未插入时桌面也不挂（[隐藏与 Loader disabled](2026-09-07-overlay-card-hide-and-loader-disabled.md)）。浏览器轮询该名册，因此再次插入可以加一扇窗而不重挂已有卡片。传输失败（通道未挂上时 SPA 返回 `405`）会保留上一份名册，初始是默认的第一张卡片。宿主 `lib/index.js` 不会热换：现场改宿主逻辑需要从未导入过的 specifier，不是同一包名下换 `--id`（[现场路径](2026-09-04-overlay-web-plugin-live-path.md)）。卡片插入在 profile 还没有 overlay-card RPC 行时写入 `./overlay-card-roster-rpc.mjs`，用该 specifier 挂上 `/overlay-card`（[名册通道](../bug-fix/2026-09-06-overlay-card-roster-channel.md)）。`pnpm overlay:live insert packages/client/ui-float-window` 写入第一条 spec（省略的标志走上述默认），之后再插入同一包不再复制 `lib/`。`--id` 仍是 Loader 目录 id。`pnpm overlay:live remove overlay-card-<id>` 去掉那个唯一 id。`pnpm overlay:live remove ui-float-window`（或该 Loader id）卸载整张桌面。

发布的包名仍是 `@deepseek-ai/dsh-client-ui-float-window`；占用者身份是 `overlay-card`。页面为 `SlotMap` type-import `…/client`，不得 value-import `OverlayCard`。默认产品页面占据 `overlay-card.body`（卡片 1）。

该**卡片**形态的操作 HOW 是 skill [dsh-overlay-web-plugins](../../../skills/dsh-overlay-web-plugins/SKILL.md)：总是插入卡片模块，用 `pnpm overlay:new-page <name>` 写页面（[页面骨架](../process/2026-09-05-overlay-new-page.md)），挂载时调用 `preferFrame`（骨架里已有），然后对页面 `overlay:live insert|update`。不要因为某个 profile 已经显示出卡片就跳过卡片插入。不要克隆另一个占用者或本卡片当页面包。任意形状悬件和桌面形态是另外的形态（[形态 skill](../process/2026-09-05-overlay-frontend-form-skills.md)）。相关记录：[现场路径](2026-09-04-overlay-web-plugin-live-path.md)、[名册通道](../bug-fix/2026-09-06-overlay-card-roster-channel.md)、[隔离](2026-09-06-overlay-card-isolation.md)、[可玩白板](2026-09-06-overlay-playable-board.md)、[边缘标签](2026-09-07-overlay-card-edge-tag.md)、[overlay 叠放](2026-09-07-overlay-stack-and-card-plug.md)。页面占用者见[客户端插件注册表](../../../../packages/client/README.md)；每个包的 README 拥有该占用者的描述（[描述注册表](../process/2026-09-05-client-plugin-description-registry.md)）。

## Alternatives considered

**把铬框放进 `ui-primitives`。** 否决 — 卡片需要 slot、register 声明的 store 和 Loader 座位。客户端插件不得 value-import 另一个插件的组件。

**保留两套窗口插件（带产品品牌的加上通用的）。** 否决 — 预发布阶段只要一个卡片模块；产品文案由页面拥有。

**用同一 npm 包的两行 Loader 行来生成两张浏览器卡片。** 否决 — 客户端模块图按包名索引，两行 yaml 仍然只跑一次浏览器 `apply()`。Locale 的 `(ns, locale)` 不能注册两次。槽名全局唯一。编号窗口是同一个浏览器插件里的实例，由 `instances.json` 名册管理。

**用 Loader `config` 配标题和默认尺寸。** 否决 — `overlay:live` 只写 Loader `{ id, name }`；浏览器半收不到 Loader config。标题、唯一 id 和开场尺寸是插入 `--title` / `--card-id` / `--width` / `--height`，存在 `instances.json` 的 `OverlayCardSpec` 上。页面 `preferFrame` 仍可在挂载后改尺寸。之后用户仍可拖动缩放。座位编号仍是槽名，不是 Loader config。

**卡片读取占用者 inject 或 `slots.entries()` 来选尺寸。** 否决 — slot 组件看不到 `ctx`；现场数据是 owner props、本地状态或声明的 store。`preferFrame` 就是 owner 回调。

**把现场 `x` / `y` 写入 `instances.json`。** 否决 — 该文件是插入时的名册加上 `hidden` 和 `occupants`。拖动时每次都要打宿主 RPC。浏览器 `localStorage` 与会话轨和页面刷新一致。

**可视化仍把铬框和页面放在同一个包。** 否决 — 铬框属于可复用卡片；产品包复制顶栏拖动和八边缩放就是昂贵路径。

**重命名 npm 包。** 否决 — 占用者身份是 `overlay-card`；改目录需要宿主侧 workspace 安装，不是槽契约所要求的。

**把整条顶栏做成可替换的 single 槽。** 否决 — 拖动捕获在 `OverlayCard` 上；整条替换会丢掉拖动，除非占用者再实现一遍。右侧 list 才是控件孔。大顶栏是改本包里的 `OverlayCard`。

**把插入上限钉在八个预先声明的 SlotMap 键上。** 否决 — 产品张数没有上限。OverlayDesk 按名册高水位扩大 children 表，而不是换一条组合路径（`keyed` 的 `overlay-card.body` 会破坏 `dsh.client.overlayBody` 和 `overlay-card-N.body` 的 inject）。

**只在顶栏或缩放手柄的指针按下时置顶。** 否决 — 窗体内的指针按下也是对该窗口的注意，必须同样置顶。

**在窗口上用冒泡阶段监听来置顶。** 否决 — 右侧铬框会停止传播，那些点击会漏掉。窗口上的捕获阶段使用与顶栏拖动相同的左键判定。

## Consequences

纯前端的**卡片** overlay 工作就是：插入卡片（可带标题、唯一 id 和开场尺寸），再为 `overlay-card.body`（或 `overlay-card-N.body`）写页面，可选地在挂载时调用 `preferFrame`。每个窗体槽都是 `kind: 'single'` — 一张卡片一个页面占用者。卸载 `overlay-card-<id>` 去掉一扇窗；卸载 Loader id 去掉整张桌面。窗体占用者可以是带页内导航、表单和本地 React 状态的完整交互页；那仍是这个槽，不是第二种呈现形态，也不单独写一篇占用者 Agent Note。桌面形态由 [桌面基模](2026-09-10-overlay-desktop-host.md) 撰写；本笔记不撰写它。卡片外框在页面刷新后由 `localStorage` 保留；清除站点数据后回到插入时的摆放。

## Testing

卡片包覆盖顶栏拖动、八边缩放（四边命中是外侧 4px 条）、最小外框、36px 叠层顶栏且身份文字仍是现有 13px 铬框字体、插入时的标题/id/尺寸、`preferFrame` 应用尺寸（和可选原点）且不移动其它座位、第一次 adopt 或已存储外框之后忽略后来的 `preferFrame`、身份 `{title} {id}`、不会开始移动的右侧铬框、内置缩小把卡片收成边缘标签、窗体或右侧铬框上的鼠标左键按下把该卡片置顶且不移动它、第二扇窗保留第一张外框、窗体内 hash 解析、空窗体标签、宿主 `instances.list`（含 `webServer` 上的 `/overlay-card` 前缀）、RPC 抛错时名册轮询保留上一份快照、`overlay:live` 对 `overlay-card-<id>` 的增删并在名册通道缺失时写入 `./overlay-card-roster-rpc.mjs`、插入第九张卡片，以及名册高水位为 9 时 OverlayDesk children 扩到座位 16。已知缺口：没有自动化测试证明两个现场页面插件不能共享 `overlay-card.body`；钉住这一点的是 `kind: 'single'`。
