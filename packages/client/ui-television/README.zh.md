# @deepseek-ai/dsh-client-ui-television

[English](README.md) | 中文

`shell.overlay` 上的 CRT 电视悬件。浏览器半边把 `Television` 注册为 id `television`、order 180（不是 `root`，不是 `cursor-agent`，不是 `overlay-card.body`，不是 `overlay-desktop.body`）。本包声明 `dsh.client.panelTitle` 且不写 `overlayBody`，因此 Cursor 轨把它列为独立 fiber（拔出写 Loader `disabled`；不提供隐藏）。机柜是命中区域；CRT 的 iframe 打开 `https://example.com/`，频道板可改到其它 `http` / `https` 地址。发送 `X-Frame-Options` 或 `frame-ancestors` 的站点屏幕会空白。拖动、点穿挖洞和可复用异形宿主不在本包。节点半边是空的 Loader 座位。默认 web-app 名录不挂载本包。现场插入：`pnpm overlay:live insert packages/client/ui-television`。

`/client` 导出是插件体（`apply` / `inject`）和 `overlay-television` 文案键联合。机身组件留在包内。

## Model Experience

无。这台 overlay 电视只是浏览器侧的 shell.overlay fiber，不注册任何面向模型的内容。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- **不得占用 `root` 或复用 `cursor-agent`** — `root` 会盖住 AppFrame；`cursor-agent` 是 Cursor overlay 面板。
- **不是卡片或桌面占用者** — 本 fiber 不声明 `overlayBody`，也不插入 `ui-float-window` 或 `ui-overlay-desktop`。
- **被嵌的页面可能拒绝加载** — CRT 是 iframe；许多站点禁止嵌入。
- **不能拖，也没有可复用异形宿主** — 位置由 CSS 摆放；shaped HOW 仍未写成。
