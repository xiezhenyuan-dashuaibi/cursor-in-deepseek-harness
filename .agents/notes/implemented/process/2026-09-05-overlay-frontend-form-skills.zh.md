# Agent Note: Overlay 前端有三种呈现形态和三个 skill（技能）

Status: implemented

[English](2026-09-05-overlay-frontend-form-skills.md) | 中文

## Problem

overlay 前端工作被当成一套规程。贡献者于是把精灵、电视形悬件或整页白画板硬塞进可复用卡片（`overlay-card.body`），或者占据 `root` 来做出文档的样子。卡片 HOW 并不描述那些形态，从卡片 skill 里发明它们会做出错误的铬框。

## Decision

overlay 前端有三种呈现形态，各自对应一个 DSH skill：

| Form | Skill | HOW |
|---|---|---|
| 带顶栏铬框、窗体里是网页的悬浮矩形**卡片** | [`dsh-overlay-web-plugins`](../../../skills/dsh-overlay-web-plugins/SKILL.md) | 已撰写。规范包 [`ui-float-window`](../../../../packages/client/ui-float-window/README.md)（`overlay-card` / `overlay-card.body`） |
| 悬浮的**任意形状**占用者（精灵、电视形悬件、任何非卡片轮廓） | [`dsh-overlay-shaped-plugins`](../../../skills/dsh-overlay-shaped-plugins/SKILL.md) | 预留空位；正文尚未撰写 |
| 写在网页白色画板上、不再悬浮的**整页**产品 | [`dsh-overlay-canvas-plugins`](../../../skills/dsh-overlay-canvas-plugins/SKILL.md) | 预留空位；正文尚未撰写 |

Overlay Cursor 在编写或现场插入该形态之前，用 `dsh_skill` 加载对应 skill。遇到预留 skill 时停下，并告诉用户呈现 HOW 尚未撰写。不要发明规程。不要把非卡片轮廓占据 `overlay-card.body`。不要占据 `root`。永远不要重启 `dsh web`。

profile 副本的现场插入仍使用 `pnpm overlay:live`（[现场路径](../architecture/2026-09-04-overlay-web-plugin-live-path.md)）。该助手不能代替缺失的呈现 HOW。卡片铬框仍是 [overlay-card 容器](../architecture/2026-09-05-overlay-card-container.md)。

常驻规则：`.cursor/rules/dsh-cursor-in-dsh.mdc`、根 `AGENTS.md`。

## Alternatives considered

**用一个 skill 覆盖每一种 overlay 前端形态。** 否决——卡片规程会被套到精灵和整页画板上。

**把任意形状悬件和整页画板写成卡片 skill 里的例外**（`inset: 0`、去掉铬框）。否决——那些是另外的形态；它们的 HOW 在预留 skill 里，不是卡片脚注。

**HOW 写好之前不把预留 skill 放进目录。** 否决——目录必须把那些任务从卡片 skill 引开。一个写着「停下」的空位就是路由。

**整页画板形态占据 `root`。** 否决——`root` 是 AppFrame。画板 HOW 是预留 skill；占据 `root` 仍然禁止。

## Consequences

卡片窗口工作走 `dsh-overlay-web-plugins`。任意形状悬件和整页画板工作加载各自的预留 skill，并在那些正文撰写之前停下。现场与启动、第一次导入缓存、禁止重启仍由[现场路径](../architecture/2026-09-04-overlay-web-plugin-live-path.md)笔记拥有。

## Testing

三个 `SKILL.md` 文件存在于 `.agents/skills/`，带目录 `name` 和 `description`。已知缺口：没有自动化测试证明现场 MCP 目录列出两个预留名，也没有测试证明模型在精灵任务上加载预留 skill 而不是卡片 skill。
