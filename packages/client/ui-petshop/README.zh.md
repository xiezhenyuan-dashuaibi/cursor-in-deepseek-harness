# @deepseek-ai/dsh-client-ui-petshop

[English](README.md) | 中文

宠物店洗剪吹预约页，占据可复用 overlay 卡片的 `overlay-card-2.body`。浏览器半注册 `Page`，不带 `id` / `order`（`kind: 'single'`）。页面在挂载时调用 `preferFrame({ width: 900, height: 560 })`，产品标题和确认按钮写在窗体里，并通过注入的回调把预约发到 `/petshop-hub` 的 `book`（需要已装载后端插件）。只有该 RPC 返回行 id 后才显示「预约成功」。节点半是空的 Loader 座位。默认 web-app 组合包不挂载本包。对应座位的卡片装好之后用 `pnpm overlay:live` 现场插入。呈现 HOW 是 [dsh-overlay-web-plugins](../../../.agents/skills/dsh-overlay-web-plugins/SKILL.md)。

`/client` 导出的是插件体（`apply` / `inject`）和 `overlay-petshop` 文案键联合类型。页面组件留在包内部。

## Model Experience

无。洗剪吹主页只是浏览器侧的 overlay 卡片占用者，不注册任何面向模型的内容。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- **表单不能活过重新挂载** — 耐久的是插件挂载本身；占用者重新挂载时套餐、时段和表单会重置。已接受的预约仍留在数据库插件的 sqlite 文件里。
- **不得占用 `root` 或复用 `cursor-agent`** — `root` 会盖住 AppFrame；`cursor-agent` 是 Cursor overlay 面板。
- **`overlay-card-2.body` 是 `kind: 'single'`** — 装载期间本页是该座位的唯一占用者。座位 1 仍可放另一个产品。
