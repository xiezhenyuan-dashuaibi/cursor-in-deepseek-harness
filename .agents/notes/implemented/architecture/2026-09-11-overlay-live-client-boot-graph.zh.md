# Agent Note: Overlay live insert waits on the client boot graph, not the plugin rail

Status: implemented

[English](2026-09-11-overlay-live-client-boot-graph.md) | 中文

## Problem

现场 overlay 页面可以已经出现在插件栏，却仍不在 `window.__DSH_BOOT__` 里。插件栏读的是 profile yaml。启动图是 Node 侧 client-modules 表，由它提供 `/plugins/<id>/client.js`。贡献者把 yaml 行加上填充的「空桌面」当成「Loader 没有挂上」，然后给宿主 fiber 已经是 `active` 的包改名。`parseDshClient` 对未知的 `dsh.client.overlayBody` 字符串抛错，就是这种遗漏：宿主 `apply` 已经跑过，flush 只 `logger.warn`，浏览器行从未加入。长寿命的 `dsh web` 在进程期内一直用第一次导入的扫描器，所以更新的槽名（旧扫描器上的 `overlay-desktop.body`，或以后的槽）会以同样方式失败。一律建议换新 npm 名的等待辅助修不好这种组合遗漏，还会烧掉 checkout。

## Decision

启动图准入条件是 `platform: 'web'` 加上 `exports["./client"]`。[`parseDshClient`](../../../../packages/client/modules/src/index.ts) 仍记录已识别的 `overlayBody`（`overlay-card.body`、N ≥ 2 的 `overlay-card-N.body`、`overlay-desktop.body`）。未知字符串会从解析结果中省略，因而不能让组合失败。非字符串 `overlayBody` 仍会抛出。占用者包继续声明真实槽：插件栏和 `overlay:live` 的互斥桌面插入读的是 checkout `package.json`，不是扫描器里的这个字段。

[`overlay:live insert`](../../../../scripts/overlay-live-plugin.ts) 对 `dsh.client` 包会 `GET /` 直到该 npm 名出现在 `window.__DSH_BOOT__`（默认 15 秒，`--no-wait` 可跳过）。未出现时探测 `pluginInventory/list`，并打印下列之一：

- 没有 Loader fiber，或 `fiberPhase` 为 `failed`——第一次 ESM 导入中毒，或 yaml 没有挂上；换新 npm 名和新 `--id`；不得重启 `dsh web`；
- fiber 为 `active`——宿主已挂上，client-modules 没有写入浏览器行；不要改名；省略现场 `overlayBody`，重挂该 Loader 行，再等一次，然后不经第二次重挂恢复原来的现场 `package.json`；
- inventory RPC 不可达，或 fiber 为 `pending` / `loading` / 已禁用——不要改名。

本笔记部分替代 [live path](2026-09-04-overlay-web-plugin-live-path.md) 里关于等待诊断的那一句。现场与启动、第一次导入缓存、不得重启仍由该笔记拥有。桌面占用仍由 [桌面基模](2026-09-10-overlay-desktop-host.md) 拥有。操作 HOW 仍在各形态 skill。

## Alternatives considered

**重启 `dsh web`，让正在跑的进程重载 `parseDshClient`。** 否决——overlay Cursor 就是该进程；重启会丢掉正在干活的会话。

**对未知 `overlayBody` 字符串继续抛错。** 否决——该字段是插件栏和互斥插入的元数据。把它当成启动图门槛，会在宿主 fiber 仍在时把页面藏起来。

**把插件栏当作客户端半边已挂载的证明。** 否决——插件栏列出的是 yaml；`__DSH_BOOT__` 才是现场客户端表。

**等待失败就一律改名。** 否决——改名能救第一次 ESM 导入中毒。`active` fiber 已经被导入；换新 npm 名是弯路。

**从 `overlay:live` 清掉 Node 的 ESM 缓存或 client-modules 的 `pkgMeta` 缓存。** 否决——二者都是进程期缓存。恢复路径是改磁盘后再重挂，让当前扫描器能够接受。

**把 Cursor 面板的 RPC 辅助导入 `overlay:live`。** 否决——overlay Cursor 禁止改 `packages/client/ui-cursor-agent/`。该辅助自行复制 inventory URL 和信封。

**跳过省略 `overlayBody` 后的重挂恢复。** 否决——长寿命进程仍运行它启动时导入的扫描器。在现场副本上省略该字段、重挂、再在不二次重挂的情况下恢复该字段，就能让浏览器行加入，同时保留插件栏的槽声明。

## Consequences

新的桌面（或卡片）页面可以对基模执行 `pnpm overlay:live insert`、生成占用者、再等待启动图；fiber 已经是 `active` 时不必改名。`overlayBody` 已匹配扫描器正则的卡片走不变的成功路径。互斥桌面插入、卡片隐藏/拔出、以及默认 web-app 名录均未改动。导入了旧扫描器的进程在该进程结束之前仍需要重挂恢复。

## Testing

`packages/client/modules/tests/node-half.client.spec.ts` 固定未知字符串 `overlayBody`（`root`、`overlay-card-1.body`）加入启动图、`overlay-desktop.body` 加入、以及非字符串抛错。`scripts/overlay-live-plugin.spec.ts` 固定 `LiveClientBootWaitError`、`pluginInventory/list` 命中与缺失、`failed` fiber 不得重挂、以及 `active` fiber 省略 `overlayBody`、重挂一次、再恢复该字段。已知缺口：没有针对长寿命 `dsh web`（内存里的扫描器早于这次 `parseDshClient` 修改）的自动化测试；对该进程的钉就是重挂恢复。
