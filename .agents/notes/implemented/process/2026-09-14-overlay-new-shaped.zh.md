# Agent Note: Overlay 异形占用者包用生成，不靠克隆

Status: implemented

[English](2026-09-14-overlay-new-shaped.md) | 中文

## Problem

可复用 overlay 异形基模是 [`ui-overlay-shaped`](../../../../packages/client/ui-overlay-shaped/README.md)：插入它，不要复制那棵树。任意形状产品仍需要一个完整的客户端包来占 `overlay-shaped.body`（`package.json`、`tsconfig`、文案、剪影组件、测试、README）。shaped skill 禁止克隆另一个占用者，也禁止用产品铬框占据 `shell.overlay`；没有写入器时，这些文件会从独立 fiber、产品占用者或基模本身拷来。占用者 `tsconfig.json` 必须引用基模的 composite emit 根，否则 `tsc -p` / `tsc -b` 失败，后续 agent 会卡在构建迷宫里。落地行（注册表、aggregate 路径、Model Experience、省略名单）否则会从兄弟包抄来，HOW 里又出现占用者名字。

## Decision

`pnpm overlay:new-shaped <name>`（`scripts/overlay-new-shaped.ts`）在 `packages/client/<name>/` 写出仅前端的占用者包。基模仍然只插入。生成的 `dsh.client` 含 `overlayBody: overlay-shaped.body`，以便 `overlay:live insert` 能要求宿主存在，并把占用者列为轨上 fiber。生成的 `tsconfig.json` 引用 `../ui-overlay-shaped/tsconfig.client.json`。生成的 `package.json` 含 `scripts.build`（`tsc -p tsconfig.json && tsdown`）。生成器在那些 checkout 文件存在时还会写入客户端注册表行、aggregate tsconfig 路径、Model Experience 行，以及 web-app 省略名单（`scripts/overlay-page-checkout.ts` 的 `shaped` 形态）。它不改 `packages/bundle/web-app/cordis.patch.yml`。保持生成的导出名 `OverlayShapedKey`。浏览器半边把 `Occupant` 注册进 `overlay-shaped.body`，带 list `id`（目录 slug）和 `order: 10`。现场出现是先对宿主、再对占用者执行 `pnpm overlay:live insert`；该命令在有 `tsdown.config.ts` 时构建 `lib/`，并等到 npm 名出现在 `window.__DSH_BOOT__`。等待分类（fiber 与 client-modules）见 [启动图等待](../architecture/2026-09-11-overlay-live-client-boot-graph.md)。不带 `--keep-files` 的 `pnpm overlay:live remove <id>` 是省略名单占用者的逆操作：删除该目录和那些行。Host RPC 仍是按 skill 片段改空的 `src/index.ts` `apply()`。占用者描述写在该包 README；写入器不另写一篇功能 Agent Note（[描述注册表](2026-09-05-client-plugin-description-registry.md)）。

宿主座位拥有拖动、持久化和板内置顶（[异形拖动](../architecture/2026-09-14-overlay-shaped-drag.md)）。生成器写出占用者 `onClick`，不写出占用者拖动、隐藏或 `setPointerCapture`。占用者点击失效时，用 `overlay:live update` 刷新宿主，不要改成占用者 `onPointerDown`。挂着不画由宿主拥有（[异形隐藏](../architecture/2026-09-14-overlay-shaped-hide.md)）。操作 HOW：[dsh-overlay-shaped-plugins](../../../skills/dsh-overlay-shaped-plugins/SKILL.md)。异形宿主：[overlay 异形宿主](../architecture/2026-09-14-overlay-shaped-host.md)。现场与启动：[live path](../architecture/2026-09-04-overlay-web-plugin-live-path.md)。占位出现之后的剪影布局见 [画面独立](2026-09-12-overlay-occupant-visual-independence.md)。不带 `overlayBody`、占据 `shell.overlay` 的 checkout 包是独立 fiber（[独立电视](../architecture/2026-09-14-overlay-television-standalone-fiber.md)）；新的形状不复制那种占用。

## Alternatives considered

**只把完整文件树贴进 skill。** 否决 — `package.json` 的 exports、`files` 和 README 门禁会漂；skill 是指导，不是写入器。

**用产品铬框占据 `shell.overlay`**（独立 fiber）。对新形状否决 — 那种占用不共享 list 画板；第二个剪影会再注册一个铬框 id，而不是 `overlay-shaped.body`。

**把产品占用者或当前画着的悬件当骨架。** 否决 — 占用者是产品剪影，不是骨架；在 skill 里点名会让已删插件继续活着。

**占据 `overlay-card.body` 或 `overlay-desktop.body`。** 否决 — 卡片是矩形铬框；桌面是 `kind: 'single'` 且互斥。异形是 `kind: 'list'` 且可并存。

**把异形宿主列为轨上 fiber。** 否决 — 那一行不是产品名；操作者会把整块画板拔掉。宿主不出现在列表里，和桌面基模一样（[异形隐藏](../architecture/2026-09-14-overlay-shaped-hide.md)）。

**占用者 `tsconfig.json` 引用基模 solution `../ui-overlay-shaped`。** 否决 — 那是 `files: []` 的 solution（host+client refs），不是 composite emit 根。`tsc -p` 需要 `../ui-overlay-shaped/tsconfig.client.json`。

**注册表和 tsconfig 留给事后手改。** 否决 — agent 就会打开另一个占用者包去抄那些行，HOW 里又出现占用者名字。

**占用者 `onPointerDown` 或占用者 `setPointerCapture`，只因为占位按钮点不着。** 否决 — 推迟的宿主 Pointer Capture 才是点击契约（[异形拖动](../architecture/2026-09-14-overlay-shaped-drag.md)）；改占用者是在给过期的宿主 `lib/` 打补丁。

**把第二次插入宿主当成刷新。** 否决 — 再次插入宿主是空操作；`overlay:live update` 才复制 `lib/` 并重写轨 sidecar。

## Consequences

新的异形占用者是：插入基模、`overlay:new-shaped`、workspace 安装、只替换该包里的占位文案、对占用者 `overlay:live insert`。替换占位不包括去搜索、grep 或打开兄弟占用者的前端，除非用户明确要求做一个与那个产品类似的东西。卸载是 `overlay:live remove <id>`，并删除该省略名单 checkout 包。加入默认 web-app 名录是本次 overlay 会话结束之后再改 bundle patch。那次落地在 overlay Cursor 运行时不改 `packages/bundle/web-app/cordis.patch.yml`。可以同时启用多个占用者；再插入一个形状不会互斥禁用已有占用者。

## Testing

`scripts/overlay-new-shaped.spec.ts` 固定 kebab 名称、`dsh.client.inject` 含 `ui-overlay-shaped`、`dsh.client.overlayBody` 为 `overlay-shaped.body`、list `id` 来自目录 slug、基模引用 `tsconfig.client.json`、`scripts.build`、生成 Occupant 的 `onClick`（占用者不写 `setPointerCapture`）、Next 步骤先插入宿主且点名 `Occupant.tsx`、目标已存在、根 package.json 缺 version、web-app `cordis.patch.yml` 不被改写，以及那些 checkout 文件存在时的落地行。`scripts/overlay-page-checkout.spec.ts` 固定 shaped 形态在异形宿主标记之后落地。已知缺口：不会在临时树里跑生成包的测试（workspace 的 `react` 链接在 `packages/client/` 下）。
