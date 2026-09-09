# @deepseek-ai/dsh-client-ui-barber

[English](README.md) | 中文

街区理发店落地页，占据可复用 overlay 卡片的 `overlay-card.body`。浏览器半注册 `Page`，不带 `id` / `order`（`kind: 'single'`）。页面在挂载时调用 `preferFrame({ width: 1080, height: 820 })`，产品标题和主按钮写在窗体里；价目、师傅、时段、预约表单、问答和招牌灯光是组件内 React 状态。节点半是空的 Loader 座位。默认 web-app 组合包不挂载本包。卡片装好之后用 `pnpm overlay:live` 现场插入。呈现 HOW 是 [dsh-overlay-web-plugins](../../../.agents/skills/dsh-overlay-web-plugins/SKILL.md)。

`/client` 导出的是插件体（`apply` / `inject`）和 `overlay-barber` 文案键联合类型。页面组件留在包内部。

## Model Experience

无。理发店落地页只是浏览器侧的 `overlay-card.body` 占用者，不注册任何面向模型的内容。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- **预约和灯光不能活过页面重载** — 跨 `dsh web` 重启耐久的是插件挂载本身；占用者重新挂载时价目、师傅、时段、表单、问答、确认和招牌灯光会重置。
- **不得占用 `root` 或复用 `cursor-agent`** — `root` 会盖住 AppFrame；`cursor-agent` 是 Cursor overlay 面板。
- **`overlay-card.body` 是 `kind: 'single'`** — 装载期间本页是唯一占用者。要换产品就卸载它。
