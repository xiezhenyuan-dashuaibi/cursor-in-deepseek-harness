# Agent Note: Overlay 异形隐藏由宿主拥有，和卡片隐藏同一套

Status: implemented

[English](2026-09-14-overlay-shaped-hide.md) | 中文

## Problem

Cursor 轨把 `overlay-shaped.body` 占用者当成 fiber：只有拔出。卡片窗口已经有两套独立标志——**隐藏 / 显示**保持占用者挂着，**插入 / 拔出**写 Loader `disabled`。操作者对异形产品也要这两个控件。隐藏时卸载会停掉 iframe。把隐藏写进 `Occupant.tsx` 会让每个剪影各搞一套。禁用异形宿主会卸掉所有占用者。独立的 `shell.overlay` fiber 没有座位，hide 文件无处施加 `visibility`。

## Decision

异形**占用者**（`dsh.client.overlayBody: overlay-shaped.body`）在轨上列为 kind `shaped`，提供隐藏和拔出，与卡片一致。异形**宿主**不出现在列表里，和桌面基模一样。桌面产品仍没有 hide 文件（[桌面宿主](2026-09-10-overlay-desktop-host.md)）。

**隐藏 / 显示**把 `hidden.json` 写在 live 异形宿主插件副本旁（`{ "hidden": ["<Loader id>"] }`）。画板仍调用 `renderSlot`；座位用 CSS `visibility: hidden`（不是 `display: none`，也不是 HTML `hidden`），以便 iframe 继续播。隐藏时跳过拖动。Loader id 到座位的接合是 npm 包名：名录 `moduleName` 等于 `StoredEntry.registrant`。SlotRegistry 写入该字段的顺序是：显式的 register `registrant`，否则 Loader 条目的模块说明符（`fiber.entry.options.name`），否则 `fiber.name`。未导出 `name` 的客户端插件靠 Loader 说明符接合。**插入 / 拔出**仍写该占用者的 Loader `disabled`。拔出不写隐藏。隐藏会留下来，所以插入后仍隐藏。此 UI 绝不 `overlay:live remove`。绝不禁用 `ui-overlay-shaped`、`ui-float-window`、Cursor 或 overlay RPC sidecar。

`plugins.setHidden` 挂在 `/overlay-plugins` 和 `/overlay-plugins-rail`。缓存的 Cursor `apply` 不会重挂；`overlay:live` 重写 `./overlay-plugin-rail-rpc.mjs`，由 sidecar 拥有这次写入。画板在有 Connection 时每 400ms 轮询该列表；没有 Connection 时隐藏快照是 `[]`。画板不加入 `ctx.overlayStack`。偏移持久化仍是 `localStorage` `dsh.overlay-shaped.offsets`（[异形拖动](2026-09-14-overlay-shaped-drag.md)）。占用者包不实现隐藏。

本笔记部分取代 [轨上 fiber](2026-09-10-overlay-plugin-rail-fibers.md)（异形占用者不是 `fiber`），以及 [异形宿主](2026-09-14-overlay-shaped-host.md)、[异形拖动](2026-09-14-overlay-shaped-drag.md)、[overlay new shaped](../process/2026-09-14-overlay-new-shaped.md)、[形态技能](../process/2026-09-05-overlay-frontend-form-skills.md) 上「隐藏尚未撰写」的条款。卡片 `instances.json` 的 `hidden` 仍由 [隐藏 vs Loader disabled](2026-09-07-overlay-card-hide-and-loader-disabled.md) 拥有。独立 fiber 如 [电视](2026-09-14-overlay-television-standalone-fiber.md) 仍只有拔出。

## Alternatives considered

**隐藏时卸载占用者。** 否决 — 挂着不画必须让 iframe 继续播。

**`display: none` 或 HTML `hidden`。** 否决 — 它们会停掉 `visibility: hidden` 还能继续跑的媒体。

**把 hide 文件放在占用者包上。** 否决 — 隐藏是宿主铬框，和卡片桌面上的 `instances.json` 一样。

**在 `hidden.json` 里存 list id。** 否决 — 轨上 id 是 Loader id；座位 id 是 list slug。npm `moduleName` / `StoredEntry.registrant` 才是接合。

**隐藏异形宿主。** 否决 — 那会跳过所有剪影。

**把异形宿主列为 fiber。** 否决 — 那一行只有拔出，也不是产品名；操作者会把整块画板拔掉。卸载走 `overlay:live remove`。

**给独立 fiber 提供隐藏。** 否决 — 那些包占据 `shell.overlay`，没有座位包裹。

**拔出时强制 `hidden: true`。** 否决 — 隐藏必须留下来，所以插入后仍隐藏。

**要求异形宿主 `inject` 必须有 Connection。** 否决 — 测试和没有 connection 的浏览器半端仍要挂上画板；隐藏轮询通过嵌套 `ctx.inject(['connection'])` 接上。

## Consequences

插件栏里的异形占用者行有隐藏/显示和插入/拔出。隐藏让剪影保持挂载但不可见。拔出暂停该 Loader fiber。异形基模不是列表行；卸载走 `overlay:live remove`。卡片仍用 `instances.json`。桌面的卸下 / 切换桌面不变。已经在跑的 overlay 上要生效，需要重挂 `/overlay-plugins-rail`（sidecar 重写）和 `ui-overlay-shaped`（座位可见性），以及能解析 `kind: 'shaped'` 的 Cursor 浏览器半端。

## Testing

`packages/client/ui-cursor-agent/tests/plugin-roster.spec.ts` 固定 `kind: 'shaped'`、异形基模不在列表里、`hidden.json` 往返、隐藏在拔出后仍在、以及 `plugins.setHidden`。`overlay-card-rpc.spec.ts` 固定异形隐藏走 `/overlay-plugins-rail` 以及拔出路由。`cursor-panel.client.spec.tsx` 固定异形行上的隐藏加拔出。`packages/client/ui-overlay-shaped/tests/` 固定 `visibility` 隐藏的座位、仍挂着的子节点、跳过拖动、`StoredEntry.registrant` 接合、以及隐藏轮询。`packages/client/runtime/tests/slots-service.client.spec.ts` 固定 Loader 条目的 registrant 戳记。`scripts/overlay-live-plugin.spec.ts` 固定 sidecar 的 `plugins.setHidden`、`return 'shaped'`、以及跳过异形宿主 npm 名。
