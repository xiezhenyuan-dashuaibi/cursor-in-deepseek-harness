# Cursor in DeepSeek Harness

[English](README.md) | 中文

这是一个**个人**项目：把 Cursor CLI（命令行界面）浮在 DeepSeek Harness 的 `dsh web` 上，做成玻璃对话卡片。它不是 DeepSeek AI 的官方产品，也不是 Cursor / Anysphere 的官方产品。

## 能做什么

- `dsh web` 上无标题栏的 Cursor 对话卡片（会话、排队、斜杠菜单、AskQuestion，含 Other 与中文输入）
- 左侧栏可隐藏或拔掉现场浮层卡片
- 浮层 CLI 上的 Cursor extras（`dsh_skill`、`dsh_system_prompt`）

## 上游

树里带有 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（MIT）作为宿主。官方 DSH 仍在那个仓库。

## 从源码运行

需要 Node.js `^22.19 || >=24`、[pnpm](https://pnpm.io) 11，以及已登录的 [Cursor CLI](https://cursor.com)。

```sh
git clone https://github.com/xiezhenyuan-dashuaibi/cursor-in-deepseek-harness.git
cd cursor-in-deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

打开 `http://127.0.0.1:3080/`。浮层会跳过 DeepSeek API key 引导对话框。

## 许可证

[MIT](LICENSE)，与上游 DeepSeek Harness 相同。

第三方依赖见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
