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
| 悬浮的**任意形状**占用者（精灵、电视形悬件、任何非卡片轮廓） | [`dsh-overlay-shaped-plugins`](../../../skills/dsh-overlay-shaped-plugins/SKILL.md) | 已撰写。规范宿主 [`ui-overlay-shaped`](../../../../packages/client/ui-overlay-shaped/README.md)（`overlay-shaped` / `overlay-shaped.body`）；占用者骨架 [`overlay:new-shaped`](2026-09-14-overlay-new-shaped.md)；宿主拖动 [异形拖动](../architecture/2026-09-14-overlay-shaped-drag.md)；宿主隐藏 [异形隐藏](../architecture/2026-09-14-overlay-shaped-hide.md)。占用者 `onClick` 对推迟的宿主 Pointer Capture，以及线格与命中层共用一个内尺寸，写在该 skill 里 |
| **桌面**（产品名桌面；铺满视口、垫在卡片之下，不是悬浮卡片） | [`dsh-overlay-canvas-plugins`](../../../skills/dsh-overlay-canvas-plugins/SKILL.md) | 已撰写。规范包 [`ui-overlay-desktop`](../../../../packages/client/ui-overlay-desktop/README.md)（`overlay-desktop` / `overlay-desktop.body`） |

Overlay Cursor 在编写或现场插入该形态之前，用 `dsh_skill` 加载对应 skill。若 `dsh_skill` 缺失，从磁盘读取对应的 `.agents/skills/<form>/SKILL.md` 并继续 overlay 工作。不要编造 extra-tool 结果。不要把非卡片轮廓占据 `overlay-card.body`。不要占据 `root`。永远不要重启 `dsh web`。异形挂着不画见 [异形隐藏](../architecture/2026-09-14-overlay-shaped-hide.md)。

profile 副本的现场插入仍使用 `pnpm overlay:live`（[现场路径](../architecture/2026-09-04-overlay-web-plugin-live-path.md)）。该助手不能代替形态 skill。卡片铬框仍是 [overlay-card 容器](../architecture/2026-09-05-overlay-card-container.md)。桌面基模与互斥占用仍是 [桌面基模](../architecture/2026-09-10-overlay-desktop-host.md)。异形宿主占用仍是 [异形宿主](../architecture/2026-09-14-overlay-shaped-host.md)。异形占用者骨架仍是 [overlay 异形占用者生成](2026-09-14-overlay-new-shaped.md)。异形拖动仍是 [异形拖动](../architecture/2026-09-14-overlay-shaped-drag.md)。

常驻规则：`.cursor/rules/dsh-cursor-in-dsh.mdc`、根 `AGENTS.md`。

## Alternatives considered

**用一个 skill 覆盖每一种 overlay 前端形态。** 否决——卡片规程会被套到精灵和桌面上。

**把任意形状悬件和桌面写成卡片 skill 里的例外**（`inset: 0`、去掉铬框）。否决——那些是另外的形态；任意形状 HOW 是 shaped skill；桌面 HOW 是 canvas skill，不是卡片脚注。

**占用者 HOW 写好之前不把 shaped skill 放进目录。** 否决——即使占用者骨架还不存在，目录也必须把精灵任务从卡片 skill 引开。

**桌面形态占据 `root`。** 否决——`root` 是 AppFrame。桌面 HOW 通过 [`ui-overlay-desktop`](../../../../packages/client/ui-overlay-desktop/README.md) 占据 `shell.overlay`；占据 `root` 仍然禁止。

## Consequences

卡片窗口工作走 `dsh-overlay-web-plugins`。桌面工作走 `dsh-overlay-canvas-plugins`。任意形状悬件工作走 `dsh-overlay-shaped-plugins`：插入 [`ui-overlay-shaped`](../../../../packages/client/ui-overlay-shaped/README.md)，运行 `pnpm overlay:new-shaped`，占据 `overlay-shaped.body`（[异形宿主](../architecture/2026-09-14-overlay-shaped-host.md)，[overlay 异形占用者生成](2026-09-14-overlay-new-shaped.md)）。对该名字调用 `dsh_skill` 就会加载快速开发 HOW（占用者 `onClick`、推迟的宿主 Pointer Capture、画出来的内尺寸）。checkout 包可以不写 `overlayBody`、以独立 fiber 占据 `shell.overlay`；[`ui-television`](../../../../packages/client/ui-television/README.md) 是那条 fiber（[独立 fiber](../architecture/2026-09-14-overlay-television-standalone-fiber.md)）。那个包不是可复用宿主，也不是生成器占位。新的形状不复制那种占用。现场与启动、第一次导入缓存、禁止重启仍由[现场路径](../architecture/2026-09-04-overlay-web-plugin-live-path.md)笔记拥有。

## Testing

三个 `SKILL.md` 文件存在于 `.agents/skills/`，带目录 `name` 和 `description`。已知缺口：没有自动化测试证明模型在精灵任务上加载 shaped skill 而不是卡片或桌面 skill。
