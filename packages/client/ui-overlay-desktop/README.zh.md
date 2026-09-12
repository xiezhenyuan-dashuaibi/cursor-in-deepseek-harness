# @deepseek-ai/dsh-client-ui-overlay-desktop

[English](README.md) | 中文

可复用 overlay **桌面基模**（桌面呈现形态）：铺满视口、可穿透的一层，挂在 `shell.overlay` 上、垫在卡片和 Cursor 之下。浏览器半端把 `DesktopBoard` 注册为 id `overlay-desktop`、order 10（永不 `root`，永不 `cursor-agent`，永不 `overlay-card.body`）。根节点带 `data-overlay-board` 和 `pointer-events: none`，壳层因此保持空白处穿透。本板不加入 `ctx.overlayStack`。唯一子槽是 `overlay-desktop.body`（`kind: 'single'`）。没有占用者时画填充的「空桌面」。同时最多启用一个占用者 Loader fiber。桌面产品没有隐藏文件：卸下和切换桌面都写占用者 Loader `disabled`。节点半端是空的 Loader 座位。默认 web-app 名录不挂载本包。

`/client` 导出插件本体（`apply` / `inject`）和 `overlay-desktop` 文案键联合。画板组件留在包内。占用者包对 `@deepseek-ai/dsh-client-ui-overlay-desktop/client` 做类型导入以拿到 `SlotMap`，绝不值导入 `DesktopBoard`。

## 使用

先插入本包，再占据 `overlay-desktop.body`。不要把本树拷进产品包。用 `pnpm overlay:new-desktop <name>` 写页面包。再次插入本包是空操作（基模已经装上）。

```sh
pnpm overlay:live insert packages/client/ui-overlay-desktop
pnpm overlay:live insert packages/client/<desktop-page>
```

页面插件类型导入 `@deepseek-ai/dsh-client-ui-overlay-desktop/client`，注册进 `overlay-desktop.body`，无 id / order。页面包声明 `dsh.client.overlayBody: overlay-desktop.body`，以便 `overlay:live insert` 把其它桌面占用者写成 `disabled`。操作 HOW：[dsh-overlay-canvas-plugins](../../../.agents/skills/dsh-overlay-canvas-plugins/SKILL.md)。

## 模型体验

无：可复用 overlay 桌面只是浏览器占用者，不向模型注册任何内容。

#### KV 缓存影响

无；本包既不组装也不发送 Provider 请求。

## 已知限制与暂缓事项

- **不得占用 `root`，不得复用 `cursor-agent` 或 `overlay-card.body`** —— `root` 会盖住 AppFrame；`cursor-agent` 是 Cursor overlay 面板；卡片是另一种已撰写形态。
- **`overlay-desktop.body` 是 `kind: 'single'`** —— 该 fiber 插入期间只有一个占用者。切换桌面会禁用前一个占用者。
- **没有隐藏文件** —— 桌面产品没有 `instances.json` 的 `hidden`。插件栏桌面行只有卸下（Loader `disabled`）。
- **穿透画板** —— 宿主根保持 `pointer-events: none`。需要命中的产品页在自己的根上打开指针事件。
- **受保护 Loader id** —— Cursor 插件栏不得禁用 `ui-overlay-desktop`。
