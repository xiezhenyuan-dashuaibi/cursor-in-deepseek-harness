# @deepseek-ai/dsh-client-hmr

[English](README.md) | 中文

为通过脚本加载的客户端插件提供热重载。web 组合包无条件挂载该行。名录增删（宿主 Loader 配置项出现或消失）会推送 `graph` 帧，使已打开的页面无需刷新即可挂载或卸载对应客户端配置项。没有重建 watcher（`pnpm run dev:web`）改写客户端 bundle 时，内容轮询保持空闲；已在名录中的插件源码改动此时需要刷新，或打开该 watcher。

浏览器侧订阅系统 SSE（Server-Sent Events）通道（`GET /plugins/events`）。`graph` 帧把宿主名录与现场 loader 树做差：在模块表上 `adoptRow`/`dropRow`，对新名字调用 `loader.create`，对宿主已去掉的名字调用 `loader.remove`（永不卸载 modules 内核、本驱动或 app-shell）。`rebuilt` 帧通过与 graph 应用共享的串行队列重载一个插件。rebuilt 的顺序是：`invalidate`、`prefetch`（旧 fiber 仍在服务时加载并注册新组合包）、`registry.delete`（在 fiber dispose（资源释放）之前执行：仅 dispose fiber 会触发 vendored Loader 的 self-dispose 分支，把配置项标为禁用）、排空旧 fiber、删除 `entry.fiber`、移除自身拥有的 `<style data-plugin>` 标签、通过 `entry.refresh()` 重新导入并挂载、通过 `fiber.await()` 直接重新抛出启动失败。依赖方由 Cordis 自身重载：fiber 的激活 epoch 会串联其服务提供方的 uid，因此替换提供方 fiber 会级联所有依赖方，无需客户端图分析。node 侧使用一个 interval 检测重建：从同步基线开始 stat-poll 每个图组合包；新增一行后立即重新计算 hash；缺失行保持 dirty；只广播真实 rev 变更；在连接时以及每次名录变化时先广播 `graph` 帧，再做该次重哈希，以便新行在内容 `rebuilt` 点名它之前已在页面上创建。因此，任何生成组合包的 tsdown watch 进程都能触发内容 HMR（热模块替换），无需 builder→host 通道。

## 模型体验

无。重载驱动器属于浏览器侧机制；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包（package）既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **重载有意保持粗粒度**：会创建全新的 fiber 和组件；重载插件中的 React 状态会丢失，数据层（连接 fiber、运行时 fiber 和 Session 对象）不受影响。react-refresh 级状态保留与「重新执行组合包会重新运行 factory」冲突，因此有意排除。
- **失败时不回滚**：失败的重载或名录新增会使配置项处于 FAILED（或无 fiber）状态，并在 loader 状态投影中显示；系统不会自动恢复先前组合包。
- **重建帧不会改写内存中的启动 rev**：陈旧 rev 无害，因为组合包端点以 no-cache 提供内容；名录身份跟随 `graph` 帧，包括重新连接。
