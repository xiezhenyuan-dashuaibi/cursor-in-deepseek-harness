# @deepseek-ai/dsh-client-ui-dew-journal

[English](README.md) | 中文

占用 overlay-card.body 的晨露手帐：天气芯片、一句轻话、本页盖章。浏览器半边注册 Page，无 id / order（kind: single）。页面在挂载时调用 preferFrame({ width: 420, height: 560 })。节点半边是空的 Loader 座位。默认 web-app 组合包不挂载本包。卡片装好之后用 pnpm overlay:live 现场插入。呈现 HOW 是 [dsh-overlay-web-plugins](../../../.agents/skills/dsh-overlay-web-plugins/SKILL.md)。

/client 导出是插件体（apply / inject）和 overlay-dew-journal 文案键联合。页面组件留在包内。

## Model Experience

无。本页只是浏览器侧的 overlay-card.body 占用者，不注册任何面向模型的内容。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- 不得占用 root 或复用 cursor-agent：root 会盖住 AppFrame；cursor-agent 是 Cursor overlay 面板。
- overlay-card.body 是 kind single：装载期间本页是唯一占用者。
- 页面顶部留约 36px，文案落在卡片顶栏下面。
