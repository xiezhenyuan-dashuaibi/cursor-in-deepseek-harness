# @deepseek-ai/dsh-client-ui-flower-pot

[English](README.md) | 中文

挂在 `overlay-shaped.body` 上的青瓷牵牛花盆。浏览器半端把 `FlowerPot` 注册为 id `flower-pot`、order 10。包声明 `dsh.client.overlayBody: overlay-shaped.body` 和 `panelTitle` 花盆，因此 live insert 要求异形宿主已装上，Cursor 轨把该行列为 fiber（拔出写 Loader `disabled`；不提供隐藏）。浇水和施肥写入水分与养分；土还润着时藤蔓会生长（照料充足时几分钟内开花）。进度按这个 origin 存在 `localStorage`（`dsh.overlay-flower-pot.state`）。几何是画板左下角的 CSS 摆放。拖动、置顶、挂着不画仍未撰写。节点半端是空的 Loader 座位。默认 web-app 名录不挂载本包。异形宿主装上之后，live insert 是 `pnpm overlay:live insert packages/client/ui-flower-pot`。

`/client` 导出插件本体（`apply` / `inject`）和 `overlay-flower-pot` 文案键联合。花盆组件留在包内。

## 模型体验

无：本 overlay 花盆只是浏览器侧的 overlay-shaped.body 占用者，不向模型注册任何内容。

#### KV 缓存影响

无；本包既不组装也不发送 Provider 请求。

## 已知限制与暂缓事项

- **必须占据 `overlay-shaped.body`** —— 永不 `root`、`cursor-agent`、`overlay-card.body` 或 `overlay-desktop.body`。
- **宿主必须已经插入** —— 缺少 `ui-overlay-shaped` 时对本包执行 `overlay:live insert` 会大声失败。
- **不能拖** —— 花盆停在 CSS 原点。异形占用者的拖动/持久化/置顶仍未撰写。
- **生长只属于这个 origin** —— 清站点数据会重新栽一颗种子。没有挂着不画的名录。
