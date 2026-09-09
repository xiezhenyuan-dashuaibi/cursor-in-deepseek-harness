# @deepseek-ai/dsh-client-ui-petshop-store

[English](README.md) | 中文

预约库：宿主 SQLite 位于 `$DSH_HOME/petshop-store.sqlite`，提供 Cordis `petshopStore`（`insert` / `list`）、`/petshop-store` 的 `list` RPC，以及 `overlay-card-4.body` 上的实时表。写入方是后端插件；本页只列出。页面在挂载时调用 `preferFrame({ width: 900, height: 620 })` 并轮询 `list`。默认 web-app 组合包不挂载本包。在后端插件之前用 `pnpm overlay:live` 现场插入。呈现 HOW 是 [dsh-overlay-web-plugins](../../../.agents/skills/dsh-overlay-web-plugins/SKILL.md)。

`/client` 导出的是插件体（`apply` / `inject`）和 `overlay-petshop-store` 文案键联合类型。页面组件留在包内部。

## Model Experience

无。账本面板只是浏览器侧的 overlay 卡片占用者，sqlite 文件也不面向模型。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- **卸载不会删除 sqlite 文件** — `overlay:live remove` 会留下 `$DSH_HOME/petshop-store.sqlite`。
- **不得占用 `root` 或复用 `cursor-agent`** — `root` 会盖住 AppFrame；`cursor-agent` 是 Cursor overlay 面板。
- **`overlay-card-4.body` 是 `kind: 'single'`** — 装载期间本页是该座位的唯一占用者。
- **宿主 `lib/index.js` 不会热替换** — 改账本逻辑要用新的现场 `--id`，不要对同一目录做 `overlay:live update`。
