# @deepseek-ai/dsh-client-ui-petshop-hub

[English](README.md) | 中文

预约后端：宿主在 `/petshop-hub` 上提供 `book` / `signals`，浏览器半占据 `overlay-card-3.body` 做信号检测面板。`book` 校验主页载荷、记录每一跳，再通过 Cordis `petshopStore` 写入（由数据库插件 provide；本包不 import 那个包），并把行 id 回给主页以显示预约成功。浏览器半轮询 `signals`，点亮「主页 → 后端 → 数据库 → 回执」流水线。页面在挂载时调用 `preferFrame({ width: 600, height: 620 })`。默认 web-app 组合包不挂载本包。数据库插件和对应座位的卡片装好之后用 `pnpm overlay:live` 现场插入。呈现 HOW 是 [dsh-overlay-web-plugins](../../../.agents/skills/dsh-overlay-web-plugins/SKILL.md)。

`/client` 导出的是插件体（`apply` / `inject`）和 `overlay-petshop-hub` 文案键联合类型。页面组件留在包内部。

## Model Experience

无。信号面板只是浏览器侧的 overlay 卡片占用者，宿主 RPC 也不面向模型。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- **检测日志在内存里** — 最多保留最新 40 跳；Loader fiber 重启会清空。预约仍持久化在数据库插件里。
- **不得占用 `root` 或复用 `cursor-agent`** — `root` 会盖住 AppFrame；`cursor-agent` 是 Cursor overlay 面板。
- **`overlay-card-3.body` 是 `kind: 'single'`** — 装载期间本页是该座位的唯一占用者。
- **宿主 `lib/index.js` 不会热替换** — 改分发逻辑要用新的现场 `--id`，不要对同一目录做 `overlay:live update`。
