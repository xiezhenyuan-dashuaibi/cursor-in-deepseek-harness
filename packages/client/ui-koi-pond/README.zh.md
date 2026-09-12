# @deepseek-ai/dsh-client-ui-moyu-tank

[English](README.md) | 中文

占用 overlay-desktop.body 的工位金鱼缸：柜式玻璃缸里游着带名字的鱼，可投喂饲料、摸鱼、晃小黄鸭、开宝箱，双击敲玻璃；猫爪子伸进来时点一下赶走。浏览器半边注册 Page，无 id / order（kind: single）。节点半边是空的 Loader 座位。默认 web-app 组合包不挂载本包。桌面基模装好之后用 pnpm overlay:live 现场插入；插入本页会把其它 overlay-desktop.body 占用者写成 disabled。呈现 HOW 是 [dsh-overlay-canvas-plugins](../../../.agents/skills/dsh-overlay-canvas-plugins/SKILL.md)。

/client 导出是插件体（apply / inject）和 overlay-koi-pond 文案键联合。页面组件留在包内。

## Model Experience

无。本页只是浏览器侧的 overlay-desktop.body 占用者，不注册任何面向模型的内容。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- 不得占用 root、overlay-card.body 或复用 cursor-agent：root 会盖住 AppFrame；卡片是另一种已撰写形态；cursor-agent 是 Cursor overlay 面板。
- overlay-desktop.body 是 kind single：插入期间本页是唯一占用者。切换桌面会禁用本 fiber。
- 没有隐藏文件：插件栏桌面行只有卸下（Loader disabled）。
- 本页在整块桌面接收指针事件，才能投喂和摸鱼；卡片和 Cursor 仍叠在它上面。
