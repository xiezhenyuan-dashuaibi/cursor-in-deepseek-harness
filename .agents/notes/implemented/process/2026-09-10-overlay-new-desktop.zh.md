# Agent Note: Overlay 桌面页面包用生成，不靠克隆

Status: implemented

[English](2026-09-10-overlay-new-desktop.md) | 中文

## Problem

可复用 overlay 桌面是 [`ui-overlay-desktop`](../../../../packages/client/ui-overlay-desktop/README.md)：插入它，不要复制那棵树。桌面产品仍需要一个完整的客户端包来占 `overlay-desktop.body`（`package.json`、`tsconfig`、文案、`Page`、测试、README）。画板 skill 带有 `apply` 片段，并禁止克隆另一个占用者；没有写入器时，这些文件会从别的占用者或基模本身拷来。占用者 `tsconfig.json` 必须引用基模的 composite emit 根，否则 `tsc -p` / `tsc -b` 失败，后续 agent 会卡在构建迷宫里。

## Decision

`pnpm overlay:new-desktop <name>`（`scripts/overlay-new-desktop.ts`）在 `packages/client/<name>/` 写出仅前端的页面包。基模仍然只插入。生成的 `dsh.client` 含 `overlayBody: overlay-desktop.body`，以便 `overlay:live insert` 能互斥启用该占用者。生成的 `tsconfig.json` 引用 `../ui-overlay-desktop/tsconfig.client.json`。生成的 `package.json` 含 `scripts.build`（`tsc -p tsconfig.json && tsdown`）。生成器在那些 checkout 文件存在时还会写入客户端注册表行、aggregate tsconfig 路径、Model Experience 行，以及 web-app 省略名单（`scripts/overlay-page-checkout.ts`）。它不改 `packages/bundle/web-app/cordis.patch.yml`。保持生成的导出名 `OverlayPageKey`。现场出现是先对基模、再对页面执行 `pnpm overlay:live insert`；该命令在有 `tsdown.config.ts` 时构建 `lib/`，并等到 npm 名出现在 `window.__DSH_BOOT__`。等待分类（fiber 与 client-modules）见 [启动图等待](../architecture/2026-09-11-overlay-live-client-boot-graph.md)。不带 `--keep-files` 的 `pnpm overlay:live remove <id>` 是省略名单占用者的逆操作：删除该目录和那些行。Host RPC 仍是按 skill 片段改空的 `src/index.ts` `apply()`。占用者描述写在该包 README；写入器不另写一篇功能 Agent Note（[描述注册表](2026-09-05-client-plugin-description-registry.md)）。

操作 HOW：[dsh-overlay-canvas-plugins](../../../skills/dsh-overlay-canvas-plugins/SKILL.md)。桌面基模：[overlay 桌面基模](../architecture/2026-09-10-overlay-desktop-host.md)。现场与启动：[live path](../architecture/2026-09-04-overlay-web-plugin-live-path.md)。占位出现之后的页面布局见 [画面独立](2026-09-12-overlay-occupant-visual-independence.md)。

## Alternatives considered

**只把完整文件树贴进 skill。** 否决 — `package.json` 的 exports、`files` 和 README 门禁会漂；skill 是指导，不是写入器。

**再做一个 live 占位占用者给人复制。** 否决 — `overlay-desktop.body` 是 `kind: 'single'`，骨架包会和产品页抢槽；占位文案会被当成产品文案拷走。

**把另一个占用者当骨架。** 否决 — 占用者是产品页，不是骨架；在 skill 里点名会让已删插件继续活着。

**占用者 `tsconfig.json` 引用基模 solution `../ui-overlay-desktop`。** 否决 — 那是 `files: []` 的 solution（host+client refs），不是 composite emit 根。`tsc -p` 需要 `../ui-overlay-desktop/tsconfig.client.json`。

**注册表和 tsconfig 留给事后手改。** 否决 — agent 就会打开另一个占用者包去抄那些行，HOW 里又出现占用者名字。

## Consequences

新的桌面页面是：插入基模、`overlay:new-desktop`、workspace 安装、只替换该包里的占位文案、对页面 `overlay:live insert`。替换占位不包括去搜索、grep 或打开兄弟占用者的页面前端，除非用户明确要求做一个与那个产品类似的东西。卸载是 `overlay:live remove <id>`，并删除该省略名单 checkout 包。加入默认 web-app 名录是本次 overlay 会话结束之后再改 bundle patch。那次落地在 overlay Cursor 运行时不改 `packages/bundle/web-app/cordis.patch.yml`。

## Testing

`scripts/overlay-new-desktop.spec.ts` 固定 kebab 名称、`dsh.client.inject` 含 `ui-overlay-desktop`、`dsh.client.overlayBody` 为 `overlay-desktop.body`、基模引用 `tsconfig.client.json`、`scripts.build`、Next 步骤先插入基模且不要求单独 `bundle`、目标已存在、根 package.json 缺 version、web-app `cordis.patch.yml` 不被改写，以及那些 checkout 文件存在时的落地行。`scripts/overlay-page-checkout.spec.ts` 固定卸载和前缀安全的兄弟包名。已知缺口：不会在临时树里跑生成包的测试（workspace 的 `react` 链接在 `packages/client/` 下）。
