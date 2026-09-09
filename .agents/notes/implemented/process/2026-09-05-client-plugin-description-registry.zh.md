# Agent Note: 客户端插件描述写在插件路径里

Status: implemented

[English](2026-09-05-client-plugin-description-registry.md) | 中文

## Problem

产品插件会经常改。Agent Note、skill、cookbook 和未配对的战役文件一旦点名有哪些 overlay 插件、它们长什么样，就会过期，把已删包名留在仓库里，并重复包 README。

## Decision

客户端插件注册表是 [`packages/client/README.md`](../../../../packages/client/README.md) 里的表：目录、短角色、链到该包 README。生成目录（`module-graph`、`config-catalog`、slot 目录）从源码机械列出包。插件描述写在该包的 `README.md` / `README.zh.md`，在编写插件时一并写好。

Agent Note、skill 和 cookbook 只点名机制——`overlay-card.body`、`pnpm overlay:live`、卡片模块 [`ui-float-window`](../../../../packages/client/ui-float-window/README.md)——不点名产品占用者。不要写某次战役开发了插件 X。即便当作「不要从某某拷」的反例也不要点名占用者。不要保留点名插件的未配对转接、冒烟日志或战役笔记本。默认 web-app 组合仍以组合包 patch 为准（[省略的注册表包](../simplification/2026-09-05-web-app-omits-overlay-lab-occupants.md)）。

新建 `packages/client/<name>` 时补一行短注册表和包 README；不要再写一篇正文就是该 README 的功能 Agent Note。对省略名单占用者执行 `overlay:live remove <id>` 时，会连同该包删掉那一行注册表。

## Alternatives considered

**每个 overlay 占用者保留一篇功能 Agent Note。** 否决——占用者比卡片和现场插入机制改得更勤；那些笔记会变成战役悼词。

**把产品插件清单写进 architecture.md 或 overlay skill。** 否决——架构图管组合；skill 是呈现形态的 HOW。注册表一变，两边都会过期。

**把战役笔记归档而不是删除。** 否决适用于未配对的转接和冒烟日志，以及只剩下已删包名或包 README 复述的已实现笔记。独有机制留在[现场路径](../architecture/2026-09-04-overlay-web-plugin-live-path.md)、[overlay-card 容器](../architecture/2026-09-05-overlay-card-container.md)和本笔记。

## Consequences

overlay 产品文案只有一处。贡献者先查注册表，再读该包 README。占用者变化时，机制笔记保持稳定。

## Testing

`packages/client/README.md` 列出每个 `packages/client/*` 产品目录。`packages/bundle/web-app/tests/lab-overlay-occupants.spec.ts` 钉住组合包省略，不把省略名单写进 Agent Note 正文。已知缺口：没有门禁禁止 Agent Note 点名注册表里的包；该钉就在本笔记。
