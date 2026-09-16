# Agent Note: Overlay 卡片隐藏与 Loader disabled

Status: implemented

[English](2026-09-07-overlay-card-hide-and-loader-disabled.md) | 中文

## Problem

Cursor 轨上的插入/拔出只写名册标志并跳过桌面挂载。占用者 `apply()` 仍留在 Loader fiber 上：宿主 RPC、`provide` 和浏览器页面继续跑。操作者仍需要不删除 checkout 的窗口隐藏，以及 Cordis 已有的真正暂停：profile `cordis.patch.yml` 条目 `disabled: true`。卡片 id 与 Loader id 不是同一命名空间，轨无法猜哪条 fiber 属于哪个座位。`overlay:live` 从不写 `disabled`。

## Decision

两个独立标志。**隐藏 / 显示** 是 `OverlayCardSpec.hidden`（`true` 跳过窗口）。**插入 / 拔出** 是占用者 Loader 行在 `$DSH_HOME/profiles/web/cordis.patch.yml` 上的 `disabled: true` / 省略（现场已在监视）。保留 `plugins/<id>/`。本 UI 从不 `overlay:live remove`。正在跑的 overlay 进程从不改 [`packages/bundle/web-app/cordis.patch.yml`](../../../../packages/bundle/web-app/cordis.patch.yml)。顶栏「缩小」是把卡片收成边缘标签的观看铬框，不是这两个标志（[边缘标签](2026-09-07-overlay-card-edge-tag.md)）。

桌面只在 spec **未隐藏** 且占用者 fiber **已插入** 时挂窗口。`inserted` 只在线上：`instances.list` 总是带上它；`instances.json` 不存。任一记录的占用者行是 `disabled: true` 或现场 patch 里缺失时为 `false`。空的 `occupants` 视为已插入（拔出是空操作 / 变灰）；隐藏仍可用。拔出不强制 `hidden: true`。隐藏状态会留下，因此之后再插入不会把仍隐藏的卡突然显示出来。拔出后窗口一并收起，是因为 `inserted` 为 false，不是因为写了隐藏。桌面轮询和 Cursor 列表在第一次 `/overlay-card` 省略线上 `inserted` 时改走 `/overlay-card-plug`，这样只读 list 的先到处理不会在占用者 `disabled` 之后留下空壳或继续显示拔出。

占用关系是声明，不是某个产品的特例。可选 `dsh.client.overlayBody` 是窗体槽字符串（`overlay-card.body` 或 `overlay-card-N.body`）。[`overlay:new-page`](../../../../scripts/overlay-new-page.ts) 写入它。[`parseDshClient`](../../../../packages/client/modules/src/index.ts) 校验它，启动图仍忽略它。[`overlay:live insert`](../../../../scripts/overlay-live-plugin.ts) 把该槽映射到座位，并在对应 spec 上写入 `occupants: [loaderId]`。双面包是 **一行** Loader：禁用该 id 会同时停掉宿主 `provide` 和窗体页。另一张卡是另一行。拔掉提供者 fiber 时，`inject` 该服务的消费者会卸载，直到 fiber 回来（[服务卸载](../../../../docs/user/develop/framework/service.md)）。

宿主 `/overlay-card`（以及现场 `./overlay-card-plug-rpc.mjs` 的 `/overlay-card-plug`）提供 `instances.setHidden` 和 `occupants.setInserted`。卡片包的 `overlay:live update` 会写 `./overlay-card-hide-rpc.mjs`，并把已有的 plug-rpc Loader `name` 改到该 specifier，以便已经 import 过第一个 plug-rpc URL 的进程在 `/overlay-card-plug` 上重新挂上这些处理。`setInserted` 拒绝不在该卡 `occupants` 上的 id，拒绝桌面 / 桌面基模 / Cursor / RPC 辅助 id（`ui-float-window`、`ui-overlay-desktop`、`ui-cursor-agent` / `cursor-agent`、`overlay-card-roster-rpc`、`overlay-card-plug-rpc`、`overlay-card-hide-rpc`、`overlay-card-rpc`、`overlay-plugin-roster-rpc`、`overlay-plugin-rail-rpc`），并使用 trusted-host 权限。`overlay:live` 解析/转储会保留插入行上的 `disabled: true`，因此之后再插入别的包不会把已拔出的占用者重新启用。

Cursor 插件浮层列出卡片行 `{ id, title, hidden, inserted, occupants }`，再加上 `/overlay-plugins-rail` 然后 `/overlay-plugins` 上的桌面占用者和独立 overlay fiber，并且给卡片和异形占用者提供隐藏/显示（[异形隐藏](2026-09-14-overlay-shaped-hide.md)）。fiber 和桌面行用 Loader `disabled` 拔出；桌面产品没有隐藏文件（[桌面基模](2026-09-10-overlay-desktop-host.md)）。fiber 隐藏不是第二个 `disabled`（[轨上的 fiber](2026-09-10-overlay-plugin-rail-fibers.md)）。Overlay 叠放与轨铬框仍由 [overlay 叠放](2026-09-07-overlay-stack-and-card-plug.md) 拥有。

## Alternatives considered

**从插件浮层调用 `overlay:live remove`。** 否决 — 那会删 checkout。拔出是 Loader `disabled`；隐藏是 `hidden`。

**禁用 `ui-float-window`、Cursor 或 overlay-card RPC 行。** 否决 — 桌面、面板和写入通道必须挂着，隐藏/插入 RPC 才能继续工作。

**把 `inserted` 写入 `instances.json`。** 否决 — Loader `disabled` 才是真源；list 推导线上字段。

**拔出时强制 `hidden: true`。** 否决 — 隐藏必须留下，插入后仍隐藏的卡才不会突然出现。`inserted` 为 false 时窗口本来就不挂。

**保留 `instances.setPlugged` 别名。** 否决 — 预发布一次改名。

**为某个产品包特写占用关系。** 否决 — 连接点是 `dsh.client.overlayBody`。

## Consequences

隐藏跳过窗口并保留 spec 和已存外框。拔出暂停占用者 fiber；Cordis 卸载 inject 那些服务的依赖方；窗口保持收起直到再插入，然后跟随仍在的隐藏标志。空卡片可以隐藏；拔出变灰。带 `overlayBody` 的页面现场插入会绑定占用，不必改页面业务逻辑。卡片作者遵循 [dsh-overlay-web-plugins](../../../skills/dsh-overlay-web-plugins/SKILL.md) 里的占用协议，侧栏才能在没有产品特写接线的情况下隐藏和拔出。

## Testing

float-window 测试覆盖 `hidden` / `occupants` 解析与持久化、磁盘上 `plugged: false` 迁成 `hidden: true`、桌面仅在 `!hidden && inserted` 时挂载、隐藏在再插入后仍在、`instances.setHidden`、`occupants.setInserted` 的 yaml `disabled`、受保护与缺失的占用者 id、空占用者空操作，以及第一次 list 省略 `inserted` 时桌面轮询 `/overlay-card-plug`。`scripts/overlay-live-plugin.spec.ts` 固定插入/更新时的占用写入、sidecar 的 `instances.setHidden` / `occupants.setInserted`、`disabled: true` 的解析/转储，以及卡片 `update` 把 plug-rpc 改到 `./overlay-card-hide-rpc.mjs`。Cursor 测试覆盖两个按钮、隐藏不调用 setInserted、`occupants` 为空时拔出变灰、list 与写入的 `/overlay-card-plug` 回退、拔出后切成插入，以及独立 fiber 行带 `kind: 'fiber'` 的路由。`packages/client/modules/tests/node-half.client.spec.ts` 拒绝非法 `overlayBody`。
