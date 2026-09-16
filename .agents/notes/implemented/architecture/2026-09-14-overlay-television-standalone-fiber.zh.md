# Agent Note: Overlay 电视是独立的 shell.overlay fiber

Status: implemented

[English](2026-09-14-overlay-television-standalone-fiber.md) | 中文

## Problem

任意形状 overlay 形态（[shaped skill](../../../skills/dsh-overlay-shaped-plugins/SKILL.md)）还没有写成 HOW。屏幕里打开网页的 CRT 电视就是该形态的典型产品。把它塞进 `overlay-card.body` 或 `overlay-desktop.body` 只会练会卡片或桌面占用，而不是非卡片轮廓。占用 `root` 会盖住 AppFrame。先写可复用异形宿主会挡住第一次跑通。

## Decision

第一个异形占用者是 [`ui-television`](../../../../packages/client/ui-television/README.md)。它把 `Television` 注册进 `shell.overlay`，id 为 `television`，order 180。本包声明 `dsh.client.panelTitle` 且不写 `overlayBody`，因此 Cursor 轨把它当独立 fiber（[轨上 fiber](2026-09-10-overlay-plugin-rail-fibers.md)）：拔出写 Loader `disabled`；不提供隐藏。现场出现是 `pnpm overlay:live insert packages/client/ui-television`。CRT 是 iframe；频道板只接受 `http` 和 `https`。本包不是可复用宿主，不是生成器，也不占用 `overlay-card.body`、`overlay-desktop.body`、`root` 或 `cursor-agent`。shaped 占用者插入/生成 HOW 是 [overlay 异形占用者生成](../process/2026-09-14-overlay-new-shaped.md)。可复用画板是 [`ui-overlay-shaped`](../../../../packages/client/ui-overlay-shaped/README.md)（[异形宿主](2026-09-14-overlay-shaped-host.md)）；这台 CRT 在以后改挂到 `overlay-shaped.body` 之前仍是独立 fiber。新的形状占据 `overlay-shaped.body`；它们不复制这种占用。

## Alternatives considered

**占用 `overlay-card.body`，再用裁切把卡片变成电视。** 否决 — 那是卡片形态；skill 禁止把卡片铬框用在非卡片轮廓上。

**占用 `overlay-desktop.body`。** 否决 — 桌面是卡片底下的全视口画板，不是漂浮 CRT。

**占用 `root`。** 否决 — `root` 是 AppFrame。

**先写成 shaped HOW 和可复用宿主，再做任何产品。** 本次否决 — 第一次跑通就是这条 fiber。宿主现在是 [`ui-overlay-shaped`](../../../../packages/client/ui-overlay-shaped/README.md)（[异形宿主](2026-09-14-overlay-shaped-host.md)）。

**复用 `cursor-agent`。** 否决 — 那是 Cursor overlay 面板的 id。

## Consequences

现场插入后，overlay 层右下角画出胡桃木 CRT。禁止被嵌的站点在屏幕里保持空白。这条独立 fiber 不坐在异形座位里，因此收不到宿主拖动（[异形拖动](2026-09-14-overlay-shaped-drag.md)）。点穿挖洞和挂着不画都还没写成。该形态的占用者插入是 `pnpm overlay:new-shaped`。可复用宿主是 [异形宿主](2026-09-14-overlay-shaped-host.md)；本包不是那块画板。把本包的 `Television.tsx` 拷去当下一个异形产品，仍被 [画面独立](../process/2026-09-12-overlay-occupant-visual-independence.md) 禁止，除非用户明确要求做类似的东西。

## Testing

`packages/client/ui-television/tests/browser-plugin.client.spec.ts` 固定 `shell.overlay` id `television`、order 180、inject 等待和卸载。`television.client.spec.tsx` 固定开场 iframe 和换台。`channel.spec.ts` 拒绝非 http(s) scheme。`packages/bundle/web-app/tests/lab-overlay-occupants.spec.ts` 把本包排除在默认名录外。
