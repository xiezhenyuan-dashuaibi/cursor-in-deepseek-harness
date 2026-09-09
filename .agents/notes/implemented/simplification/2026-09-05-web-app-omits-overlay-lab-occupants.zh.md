# Agent Note: 默认 web-app 名录就是组合包 patch

Status: implemented

[English](2026-09-05-web-app-omits-overlay-lab-occupants.md) | 中文

## Problem

默认的 `dsh web` 页面会挂载 web-app 组合包里每一个 `shell.overlay` 占用者。checkout 注册表可以包含供现场插入和包测试使用的包。把那些行写进组合包，等于每个会话都在 Cursor 面板和任何现场插入的卡片旁边放上非产品铬框。

## Decision

[`@deepseek-ai/dsh-web-app`](../../../../packages/bundle/web-app/README.md) 只插入自己 `cordis.patch.yml` 里的 Loader 行，也只依赖该 patch 点名的包。checkout 里有、但该 patch 没有的客户端包，下次 `dsh web` 启动不会挂载。现场插入的 profile 行留在 profile patch 上。卡片窗口工作插入 [`ui-float-window`](../../../../packages/client/ui-float-window/README.md)，再插入页面（[dsh-overlay-web-plugins](../../../skills/dsh-overlay-web-plugins/SKILL.md)）。Cursor overlay、会话、设置和其他 web-app 名录行保留。

有哪些包见[客户端插件注册表](../../../../packages/client/README.md)。组合包省略其中哪些，由 `packages/bundle/web-app/tests/lab-overlay-occupants.spec.ts` 钉住，不在本笔记复述省略名单。

改组合包 patch 不会改变已经在跑的进程（`composeLive` 在启动时快照组合包层）。要从已打开的页面卸下组合包占用者，需要重启，或对进程已经装过的 id 做现场 profile `disabled: true` / 删行。

## Alternatives considered

**把组合包省略的工作区包当作常驻注册表删掉。** 作为组合规则否决——正在编写的现场插入占用者可以留在 checkout。**现场 `remove` 之后仍留下那些包。** 否决——不带 `--keep-files` 的 `overlay:live remove <id>` 会从 checkout 删除该省略名单占用者并清掉落地行，这样卸载不会留下可被搜到的空记录（[现场路径](../architecture/2026-09-04-overlay-web-plugin-live-path.md)）。

**把省略的行留在组合包里并设 `disabled: true`。** 否决——被禁用的组合包行仍是随产品发布的组合，也仍需要 package.json 依赖；不出现才是约定。

**只通过本机的 profile patch 卸载。** 否决——profile 的 `disabled: true` 能让已打开页面上的占用者消失，但下次启动会从组合包再次挂载它们。

## Consequences

默认的 `dsh web` overlay 显示产品铬框加上 profile 现场插入的内容。安装 web-app 组合包不会通过该组合包的依赖列表拉取被省略的注册表包。被现场卸掉的省略名单占用者会从 checkout 消失，而不是留下空的注册表行。

## Testing

`packages/bundle/web-app/tests/lab-overlay-occupants.spec.ts` 拒绝客户端注册表里有、但本组合包没有的 Loader id 和 package.json 依赖，并仍要求存在 `ui-cursor-agent` 与 `cursor-agent-gateway`。
