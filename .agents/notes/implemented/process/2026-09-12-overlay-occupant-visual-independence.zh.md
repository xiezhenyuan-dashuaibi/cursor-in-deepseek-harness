# Agent Note: Overlay 占用者前端不沿用兄弟产品的画面

Status: implemented

[English](2026-09-12-overlay-occupant-visual-independence.md) | 中文

## Problem

`overlay:new-page` 与 `overlay:new-desktop` 已经禁止把另一个占用者当包骨架来克隆。overlay agent 仍会搜索、grep 或打开兄弟占用者的 `Page.tsx` / `Page.module.css` / locales，或把当前画着的桌面当模板，再做出一角玻璃 HUD（时钟、kicker、统计、主按钮挤在一块浮垫上）。操作者于是在每张新桌面上看到同一块左下角面板，新卡片上也出现类似克隆布局，即使任务并未要求沿用某个已有产品。

## Decision

新的 overlay 占用者页面从其产品任务说明和这个新包里的生成器占位发明构图。该页面前端保持独立：不沿用另一个 overlay 占用者的风格。不要搜索、grep 或打开另一个 overlay 占用者的 `Page.tsx`、`Page.module.css`、locales 或页面测试当作参考。不要把当前画着的桌面或卡片当布局模板。只有用户明确要求做一个与某个产品类似的东西时，才打开那个占用者的页面前端。宿主铬框仍是 [`ui-float-window`](../../../../packages/client/ui-float-window/README.md) 或 [`ui-overlay-desktop`](../../../../packages/client/ui-overlay-desktop/README.md)；那些包只插入，不是页面模板。共用外观是 `--dsw-alias-*` 和 [web styling](../../../../docs/web-styling.md)，不是兄弟产品的 CSS。桌面点击穿透（基模 `pointer-events: none`，本页自己的命中目标为 `auto`）管的是哪些节点吃点击；它并不要求把控件挤进一角垫子。

操作 HOW：[dsh-overlay-web-plugins](../../../skills/dsh-overlay-web-plugins/SKILL.md)、[dsh-overlay-canvas-plugins](../../../skills/dsh-overlay-canvas-plugins/SKILL.md)。包写入器：[overlay new page](2026-09-05-overlay-new-page.md)、[overlay new desktop](2026-09-10-overlay-new-desktop.md)。占用者名称不进 skill（[描述注册表](2026-09-05-client-plugin-description-registry.md)）。

## Alternatives considered

**把一角 HUD 写进生成器占位。** 否决——那会让浮垫成为官方桌面页。

**为了画面质量去搜索、grep 或打开兄弟页面。** 否决——兄弟占用者是产品，不是设计系统。共用铬框是 token 和宿主包。

**把每个 overlay 占用者的 `Page.tsx` / `Page.module.css` 搜一遍当家风格。** 否决——仍是同一种克隆，只是多了几步。

## Consequences

Overlay Cursor 常驻规则、skill YAML 摘要、两份形态 skill、`packages/client/AGENTS.md` 以及 overlay cookbook 写明：新页面从任务说明和生成器占位发明画面；agent 不去搜索、grep 或打开另一个占用者的页面前端作参考；只有用户明确要求做一个与那个产品类似的东西时，才把另一个占用者的前端当布局模板。写入器仍拥有包骨架；本笔记拥有占位出现之后的布局独立。

## Testing

已知缺口：没有自动化测试能证明，在用户未要求做一个与某产品类似的东西时，模型不会去搜索、grep 或打开兄弟占用者的页面前端。
