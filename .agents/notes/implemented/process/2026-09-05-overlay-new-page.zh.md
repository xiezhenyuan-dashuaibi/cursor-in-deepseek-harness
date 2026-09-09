# Agent Note: Overlay 卡片页面包用生成，不靠克隆

Status: implemented

[English](2026-09-05-overlay-new-page.md) | 中文

## Problem

可复用 overlay 卡片是 [`ui-float-window`](../../../../packages/client/ui-float-window/README.md)：插入它，不要复制那棵树。卡片窗口产品仍需要一个完整的客户端包来占 `overlay-card.body`（`package.json`、`tsconfig`、文案、`Page`、测试、README）。卡片 skill 带有 `apply` / `preferFrame` 片段，并禁止克隆另一个占用者；没有写入器时，这些文件会从别的占用者或卡片本身拷来。

## Decision

`pnpm overlay:new-page <name>`（`scripts/overlay-new-page.ts`）在 `packages/client/<name>/` 写出仅前端的页面包。卡片仍然只插入。生成的 `dsh.client` 含 `overlayBody: overlay-card.body`，以便 `overlay:live insert` 能记录该座位的占用。生成器在那些 checkout 文件存在时还会写入客户端注册表行、aggregate tsconfig 路径、Model Experience 行，以及 web-app 省略名单（`scripts/overlay-page-checkout.ts`）。它不改 `packages/bundle/web-app/cordis.patch.yml`。现场出现是 `bundle` 之后的 `pnpm overlay:live`。不带 `--keep-files` 的 `pnpm overlay:live remove <id>` 是省略名单占用者的逆操作：删除该目录和那些行。Host RPC 仍是按 skill 片段改空的 `src/index.ts` `apply()`。占用者描述写在该包 README；写入器不另写一篇功能 Agent Note（[描述注册表](2026-09-05-client-plugin-description-registry.md)）。

操作 HOW：[dsh-overlay-web-plugins](../../../skills/dsh-overlay-web-plugins/SKILL.md)。卡片铬框：[overlay-card 容器](../architecture/2026-09-05-overlay-card-container.md)。现场与启动：[live path](../architecture/2026-09-04-overlay-web-plugin-live-path.md)。

## Alternatives considered

**只把完整文件树贴进 skill。** 否决 — `package.json` 的 exports、`files` 和 README 门禁会漂；skill 是指导，不是写入器。

**再做一个 live 占位占用者给人复制。** 否决 — `overlay-card.body` 是 `kind: 'single'`，骨架包会和产品页抢槽；占位文案会被当成产品文案拷走。

**把另一个占用者当骨架。** 否决 — 占用者是产品页，不是骨架；在 skill 里点名会让已删插件继续活着。

**从 `ui-float-window` 导出 `occupyCardBody`。** 否决 — 客户端插件不为其他插件 value-export helper，而且那也写不出 `package.json` 和测试。

**注册表和 tsconfig 留给事后手改。** 否决 — agent 就会打开另一个占用者包去抄那些行，HOW 里又出现占用者名字。

## Consequences

新的卡片窗口页面是：插入卡片、`overlay:new-page`、workspace 安装、只替换该包里的占位文案、bundle、对页面 `overlay:live insert`。卸载是 `overlay:live remove <id>`，并删除该省略名单 checkout 包。加入默认 web-app 名录是本次 overlay 会话结束之后再改 bundle patch。那次落地在 overlay Cursor 运行时不改 `packages/bundle/web-app/cordis.patch.yml`。

## Testing

`scripts/overlay-new-page.spec.ts` 固定 kebab / `packages/client/` 名称、`dsh.client.inject` 含 `ui-float-window`、`dsh.client.overlayBody` 为 `overlay-card.body`、`overlay-card.body` 注册源、目标已存在、根 package.json 缺 version、web-app `cordis.patch.yml` 不被改写，以及那些 checkout 文件存在时的落地行。`scripts/overlay-page-checkout.spec.ts` 固定卸载和前缀安全的兄弟包名。已知缺口：不会在临时树里跑生成包的测试（workspace 的 `react` 链接在 `packages/client/` 下）。
