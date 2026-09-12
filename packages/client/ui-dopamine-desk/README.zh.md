# @deepseek-ai/dsh-client-ui-dopamine-desk

[English](README.md) | 中文

占用 overlay-desktop.body 的满屏脉冲地面：散落圆垫累加本页多巴胺分数。涂色地面保持穿透，只有圆垫接收指针。浏览器半边注册 Page，无 id / order（kind: single）。节点半边是空的 Loader 座位。默认 web-app 组合包不挂载本包。桌面基模装好之后用 pnpm overlay:live insert 现场插入本包；该命令在有 tsdown.config.ts 时会构建 lib/。插入本页会把其它 overlay-desktop.body 占用者写成 disabled。呈现 HOW 是 [dsh-overlay-canvas-plugins](../../../.agents/skills/dsh-overlay-canvas-plugins/SKILL.md)。

/client 导出是插件体（apply / inject）和 overlay-dopamine-desk 文案键联合。页面组件留在包内。

## Model Experience

无。本页只是浏览器侧的 overlay-desktop.body 占用者，不注册任何面向模型的内容。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- 不得占用 root、overlay-card.body 或复用 cursor-agent：root 会盖住 AppFrame；卡片是另一种已撰写形态；cursor-agent 是 Cursor overlay 面板。
- overlay-desktop.body 是 kind single：插入期间本页是唯一占用者。切换桌面会禁用本 fiber。
- 没有隐藏文件：插件栏桌面行只有卸下（Loader disabled）。
- 涂色场景保持穿透：只有地面圆垫接收指针，对话、卡片和 Cursor 仍可点空白处。
