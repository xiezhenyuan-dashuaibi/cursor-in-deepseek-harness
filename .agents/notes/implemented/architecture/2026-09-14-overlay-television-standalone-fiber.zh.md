# Agent Note: Overlay 电视是独立的 shell.overlay fiber

Status: implemented

[English](2026-09-14-overlay-television-standalone-fiber.md) | 中文

## Problem

任意形状 overlay 形态（[shaped skill](../../../skills/dsh-overlay-shaped-plugins/SKILL.md)）还没有写成 HOW。自己占据 `shell.overlay` 的产品就是该形态的第一次占用。把它塞进 `overlay-card.body` 或 `overlay-desktop.body` 只会练会卡片或桌面占用，而不是非卡片轮廓。占用 `root` 会盖住 AppFrame。先写可复用异形宿主会挡住第一次跑通。

## Decision

checkout 包可以把组件注册进 `shell.overlay` 且不写 `overlayBody`，因此 Cursor 轨把它当独立 fiber（[轨上 fiber](2026-09-10-overlay-plugin-rail-fibers.md)）：拔出写 Loader `disabled`；不提供隐藏。那种占用不是可复用宿主，不是生成器，也不占用 `overlay-card.body`、`overlay-desktop.body`、`root` 或 `cursor-agent`。shaped 占用者插入/生成 HOW 是 [overlay 异形占用者生成](../process/2026-09-14-overlay-new-shaped.md)。可复用画板是 [`ui-overlay-shaped`](../../../../packages/client/ui-overlay-shaped/README.md)（[异形宿主](2026-09-14-overlay-shaped-host.md)）。本 checkout 没有示例 CRT 占用者；新的形状占据 `overlay-shaped.body`，不复制独立占用。

## Alternatives considered

**占用 `overlay-card.body`，再用裁切把卡片变成电视。** 否决 — 那是卡片形态；skill 禁止把卡片铬框用在非卡片轮廓上。

**占用 `overlay-desktop.body`。** 否决 — 桌面是卡片底下的全视口画板，不是漂浮 CRT。

**占用 `root`。** 否决 — `root` 是 AppFrame。

**先写成 shaped HOW 和可复用宿主，再做任何产品。** 本次否决 — 第一次跑通就是这条 fiber。宿主现在是 [`ui-overlay-shaped`](../../../../packages/client/ui-overlay-shaped/README.md)（[异形宿主](2026-09-14-overlay-shaped-host.md)）。

**复用 `cursor-agent`。** 否决 — 那是 Cursor overlay 面板的 id。

## Consequences

独立 fiber 不坐在异形座位里，因此收不到宿主拖动（[异形拖动](2026-09-14-overlay-shaped-drag.md)）。该形态的占用者插入是 `pnpm overlay:new-shaped`。可复用宿主是 [异形宿主](2026-09-14-overlay-shaped-host.md)。把另一个占用者的前端拷去当下一个异形产品，仍被 [画面独立](../process/2026-09-12-overlay-occupant-visual-independence.md) 禁止，除非用户明确要求做类似的东西。

## Testing

本 checkout 没有电视占用者包。`packages/bundle/web-app/tests/lab-overlay-occupants.spec.ts` 把演示占用者排除在默认名录外。运行时 registrant 测试用 `seat-a` / `seat-b` id，不用产品包。
