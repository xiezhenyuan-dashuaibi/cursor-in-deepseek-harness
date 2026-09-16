# Agent Note: Overlay web plugins load live and render as ordinary web pages

Status: implemented

[English](2026-09-04-overlay-web-plugin-live-path.md) | 中文

## Problem

overlay 上的前端加后端插件，就是普通 React 页面在和普通 Node 程序通信。贡献者却把 overlay UI 当成稀疏的插件铬框，占据 `root` 来做出「整页」的样子，在 `dsh web` 运行时改 `packages/bundle/web-app/cordis.patch.yml`，或重启该进程。这些路径会盖住 AppFrame、只在启动时生效（`composeLive` 在启动时快照组合包 patch），或杀掉正在干活的 overlay Cursor 会话。checkout 落地清单（聚合 tsconfig、双语 README、目录、100% 覆盖率）也被误当成让 3080 显示页面的路径。

## Decision

overlay 插件就是普通网页和普通 Node 服务，由 Cordis 组合。按完整产品来写：有设计的前端、宿主后端，需要持久化时还有数据库。overlay 文档就是产品的浏览器。HTML、CSS 和 JS（React + CSS Modules；共享铬框用 `--dsw-alias-*`；当那些颜色就是页面的呈现时，产品页面可以拥有局部颜色自定义属性）都在范围内。Vue、Angular、Next、Nuxt、Remix、把 Express 当应用、Tailwind 和组件库不是 overlay 的组合路径——它们要拥有文档或服务器，而且 [Web 样式](../../../../docs/web-styling.md) 禁止功能包使用那些工具包。

默认呈现的**卡片窗口**形态是 `shell.overlay` 上的可复用**卡片**：顶栏拖动和八边缩放在 [`ui-float-window`](../../../../packages/client/ui-float-window/README.md)（`overlay-card` / `overlay-card.body`）。只写页面。挂载时调用 `preferFrame` 声明开场尺寸。对该形态来说，稀疏的插件铬框不是可接受的默认。`root` 仍然是 AppFrame。见 [overlay-card 容器](2026-09-05-overlay-card-container.md)。任意形状悬件和整页白画板是另外的形态；它们的 HOW 写在 [`dsh-overlay-shaped-plugins`](../../../skills/dsh-overlay-shaped-plugins/SKILL.md) 和 [`dsh-overlay-canvas-plugins`](../../../skills/dsh-overlay-canvas-plugins/SKILL.md)（[形态 skill](../process/2026-09-05-overlay-frontend-form-skills.md)）。画板形态不要占据 `root`。

已经在跑的 `dsh web` 上要立刻生效，使用 `$DSH_HOME/profiles/<name>/plugins/` 下的剥离副本（构建出的 `lib/index.js` / `lib/client.js`，清单不含 `workspace:`），在该 profile 的 `package.json` 里写 `file:./plugins/…`，在 profile 目录里跑 `pnpm install`，再把 Loader 行写入被监视的 profile `cordis.patch.yml`。`pnpm overlay:live insert|update|remove`（`scripts/overlay-live-plugin.ts`）就是这一顺序：先复制并完成 profile 安装，再写 yaml 行，这样 Node 不会把该 `file:` URL 的第一次失败 ESM 导入缓存到进程结束。`insert` 和 `update` 在有 `tsdown.config.ts` 时发出 checkout `lib/`（`--no-build` 可跳过）。直接 CLI 调用随后等到该 npm 名出现在 `window.__DSH_BOOT__`（`--no-wait` 可跳过；测试省略等待器）。插件栏列出的是 profile yaml；那份列表不是现场客户端图。占用者已在栏里却仍显示填充的「空桌面」，可以表示 Loader fiber 已是 `active`，而 client-modules 没有写入浏览器行——见 [启动图等待](2026-09-11-overlay-live-client-boot-graph.md)。缺失或 `failed` 的 fiber 才是第一次导入中毒。`overlay:live` 会在 stderr 上区分这些情况，并在 fiber 为 `active` 时省略现场 `overlayBody` 后重挂一次。默认的 `remove <id>` 还会从 checkout 删除省略名单上的实验占用者（`packages/client/<id>` 以及注册表、aggregate tsconfig、Model Experience、省略名单），并重生派生目录，这样卸载不会留下可被搜到的空记录。`--keep-files` 保留现场副本和 checkout。卸掉卡片 Loader 只卸桌面；`ui-float-window` 留在 checkout。web-app 名录包留在 checkout。web-app 组合包 patch 是下次启动的产品组合，不是现场插入文件（[现场名录](2026-09-04-client-plugin-live-roster.md)）。Overlay Cursor 不得重启 `dsh web`；这条规则在 `.cursor/rules/dsh-cursor-in-dsh.mdc`。

Node 会把某个 profile `file:` URL 的第一次 ESM 导入缓存到进程结束。先把产物复制完整并完成 profile 安装，再写 yaml 行。第一次导入失败后，同一 URL 会一直失败，直到该行改用新 URL（新目录）或 web 进程重启。Overlay Cursor 不得靠重启 `dsh web` 来恢复。仓库根目录 `pnpm install`（或 `pnpm install --filter ./packages/client/<name>...`）是允许的：overlay 围栏拒绝的是 spine 源码，不是 `node_modules` 安装产物。`$DSH_HOME` 下的 profile `pnpm install` 仍是现场 `file:` 副本路径。

宿主 `lib/index.js` 不会热换。Loader 按插件**包名**导入；Node 把该 specifier 缓存到进程结束。换 `--id`（新的 `file:` 目录）不会让本进程已经导入过的包名再跑一次宿主 `apply`。现场改宿主逻辑的恢复路径是从未导入过的 specifier（profile 相对路径 `./….mjs`，或新的 npm 名），或之后一次进程启动。insert 或 update 会写 `./overlay-plugin-roster-rpc.mjs` 和 `./overlay-plugin-rail-rpc.mjs`，以便 `ui-cursor-agent` 的 `apply` 已缓存占用 `/overlay-plugins` 后，Cursor 轨仍能通过 `/overlay-plugins-rail` 钉住桌面占用者（[轨上的 fiber](2026-09-10-overlay-plugin-rail-fibers.md)）。Overlay Cursor 不得重启 `dsh web`。浏览器 `lib/client.js` 在覆盖 profile 副本后通过 HMR `rebuilt` 替换内容。profile patch 监视是 `apps/cli/src/profile-boot.ts` 里的仅监视 HMR 实例；web-app 模块的 `hmr` 行保持禁用。

overlay 的 `dsh_*` extra 在 `--profile cursor-mcp` 里执行（stdio，没有 Host 或浏览器）。页面是 `--profile web`。不要再起第二个 `dsh web`，也不要另绑一个 HTTP 端口来种 UI。不要在 MCP 子进程上用 Dynamic Cordis 去挂页面占用者。现场插入普通客户端插件才是 overlay 产品路径。

卡片窗口的操作步骤就是 skill [dsh-overlay-web-plugins](../../../skills/dsh-overlay-web-plugins/SKILL.md)：插件根目录、slot/RPC 接口、`pnpm overlay:new-page` 写出 checkout 页面包（[页面骨架](../process/2026-09-05-overlay-new-page.md)）、`pnpm overlay:live` 注册/启动/卸载。桌面规程是 skill [dsh-overlay-canvas-plugins](../../../skills/dsh-overlay-canvas-plugins/SKILL.md) 加 `pnpm overlay:new-desktop`（[桌面骨架](../process/2026-09-10-overlay-new-desktop.md)）。异形规程是 skill [dsh-overlay-shaped-plugins](../../../skills/dsh-overlay-shaped-plugins/SKILL.md) 加 `pnpm overlay:new-shaped`（[异形骨架](../process/2026-09-14-overlay-new-shaped.md)）。Overlay Cursor 在做前端插件工作之前加载与呈现形态匹配的 skill。若 `dsh_skill` 缺失，从磁盘读该 skill 并继续。不要靠翻架构笔记或组合包 patch 把页面装到已打开的 overlay。双面 RPC 就是同一个包里的宿主 `apply` 加页面 `apply`；描述写在该包 README。Cursor 侧栏的占用关系见 [隐藏与 Loader disabled](2026-09-07-overlay-card-hide-and-loader-disabled.md)。插件注册表是 [`packages/client/README.md`](../../../../packages/client/README.md)。[overlay 网页插件](../../../../docs/cookbook/overlay-web-plugins.md)页是卡片形态在文档站点上的指针。[overlay 桌面插件](../../../../docs/cookbook/overlay-desktop-plugins.md)页是桌面形态的指针。[overlay 异形插件](../../../../docs/cookbook/overlay-shaped-plugins.md)页是异形形态的指针。

## Alternatives considered

**每次改插件都重启 `dsh web`。** 否决——overlay Cursor CLI 就是该进程；重启会丢掉正在干活的会话。

**进程还在跑时改 web-app 组合包 `cordis.patch.yml`。** 否决——组合包层是随产品发布的组合；`composeLive` 不会重读它们。现场用户编辑属于已经在监视的 profile 和 home patch。

**占据 `root` 让插件看起来像独立站点。** 否决——`root` 会盖住 AppFrame。桌面形态占据 `overlay-desktop.body`，不是第二个 `root`。卡片形态的默认呈现是可复用的可拖可拉卡片；额外窗口是该卡片的编号实例，不是 `shell.overlay` 上的第二套铬框。

**把 Vue、Next 或 Express+Tailwind 应用挂成 overlay。** 否决——overlay 已经是 React 文档加 Node 宿主。那些栈要拥有 `index.html` 或 HTTP 服务器；slot 占用者是 React 组件和 Cordis `apply()`。CSS Modules 加 token 代替组件库。

**让 profile 的 `file:` URL 指向 checkout 的 `packages/client/…`。** 否决——那份清单使用 `workspace:^`，profile 的 `pnpm` 解析不了。现场产物是 profile `plugins/` 目录下的剥离副本。

**把 overlay UI 当成没有 CSS 的无 token 铬框。** 否决——overlay 是真正的文档；适用 [Web 样式](../../../../docs/web-styling.md)，产品 overlay 页面必须看起来像设计过的网页。

**让每个 overlay 占用者默认铺满视口。** 否决——卡片能让产品壳保持可见，并让用户自己放置和缩放页面。把文档写成不再悬浮的画板是预留形态，不是卡片默认。

**现场 `remove` 之后留下 checkout 源码。** 否决——已卸载的占用者如果还留在注册表、tsconfig、省略名单或生成目录里，就是可被搜到的空记录，会误导之后的 agent。完全卸载是默认；`--keep-files` 是逃生口。

**靠翻架构笔记、组合包 patch 和 checkout 清单一页页摸索，才能把页面装到已打开的 overlay。** 否决——加载与呈现形态匹配的 skill；`pnpm overlay:live` 负责 insert、update、remove。卡片 HOW 是 `dsh-overlay-web-plugins`。

**再起第二个 `dsh web` 或另绑一个 HTTP 端口来种 overlay UI。** 否决——extra 在 `cursor-mcp` 里跑；页面是已经在跑的 web profile。现场插入才是产品路径。

**在 MCP 子进程上用 Dynamic Cordis 去挂页面占用者。** 否决——那只会改 stdio 进程；已打开的页面不变。

**在 Loader 卸载时清掉 Node 的 ESM `file:` 导入缓存。** 否决——该缓存是进程级 Node 行为，不是 Cordis 表。恢复方式是从未导入过的 specifier，或等到以后进程再启动。

**把插件栏当作 fiber 已挂载的证明。** 否决——插件栏读的是 profile yaml；`window.__DSH_BOOT__` 才是现场客户端图。

**重新启用 web-app 模块的 `hmr` 行，好让现场 yaml 总会重挂。** 否决——共享模块 HMR 的重载生命周期未经测试；`apps/cli/src/profile-boot.ts` 里的仅监视 HMR 已经在看 profile patch。

## Consequences

overlay 插件工作按普通应用写前端和后端，再走 profile 现场路径出现在已打开的页面上。checkout 落地仍是让 3080 显示页面之外的另一次工作；对省略名单占用者的现场 `remove` 是那次落地的逆操作。本笔记保持有效：它拥有现场与启动路径的划分、第一次导入缓存、MCP 与 web 的进程划分、框架与外壳的划分、不得占用 `root` 的否定保证、overlay 会话不得重启的规则、对省略名单 checkout 占用者的完全卸载、`overlay:live insert` 时的 checkout 自动构建，以及 CLI 等待 `window.__DSH_BOOT__` 而不是 yaml 插件栏。等待失败时如何区分 fiber 与 client-modules，见 [启动图等待](2026-09-11-overlay-live-client-boot-graph.md)。它不取代现场名录的 HMR 内部机制、也不取代 [overlay-card 容器](2026-09-05-overlay-card-container.md) 或 [形态 skill](../process/2026-09-05-overlay-frontend-form-skills.md)。卡片窗口 HOW 是 skill `dsh-overlay-web-plugins` 加上 `overlay:live`。桌面 HOW 是 skill `dsh-overlay-canvas-plugins` 加上 `overlay:live`。插件描述写在包 README（[描述注册表](../process/2026-09-05-client-plugin-description-registry.md)）。

## Testing

卡片包测试覆盖拖动、边缘缩放、最小外框和 `preferFrame`。`scripts/overlay-live-plugin.spec.ts` 钉住先安装再写 yaml、缺失 `lib/index.js` 时不得写 Loader 行、update 不改 yaml、remove 去掉行但不删 `$HOME/.dsh` 下的 SQLite、remove 删除省略名单上的 checkout 占用者、`--keep-files` 保留 checkout，卡片插入在名册通道缺失时写入 `./overlay-card-roster-rpc.mjs`，insert 或 update 会写 `./overlay-plugin-roster-rpc.mjs` 和 `./overlay-plugin-rail-rpc.mjs`，checkout 有 `tsdown.config.ts` 时调用构建钩子，用桩等待器要求 `window.__DSH_BOOT__`，以及等待分类和省略 `overlayBody` 后的重挂恢复。`scripts/overlay-page-checkout.spec.ts` 钉住落地/卸载和前缀安全的兄弟包名。对 `http://127.0.0.1:3080` 的现场验证使用 Playwright `waitUntil: 'domcontentloaded'`。已知缺口：没有自动化测试证明 Node 会把失败的 `file:` 导入保留到进程结束；该钉就在本笔记。
