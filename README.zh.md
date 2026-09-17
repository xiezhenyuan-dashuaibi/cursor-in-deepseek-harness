# Cursor in DeepSeek Harness

[English](README.md) | 中文

DeepSeek Harness，**夯**！

但 DeepSeek V4 Flash，模型能力还不太够看。

Cursor 会员应该会非常喜欢这个项目。它把 Cursor 植入了 DeepSeek Harness，完全继承了 DeepSeek Harness 的优秀特性，也把 Cursor 终端那套能力带了过来。套了个前端壳，接到 `dsh web` 上。

开发的时候插件很好插，插进来也能统一管理。不用一次做完，可以自己往上长。

个人项目。不是 DeepSeek 官方，也不是 Cursor 官方。模型和额度走你自己的 Cursor 账号。

## 运行

需要 Node.js `^22.19 || >=24`、[pnpm](https://pnpm.io) 11，以及已经登录的 [Cursor CLI](https://cursor.com)。

```sh
git clone https://github.com/xiezhenyuan-dashuaibi/cursor-in-deepseek-harness.git
cd cursor-in-deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

浏览器打开 `http://127.0.0.1:3080/`。

## 许可证

[MIT](LICENSE)，与上游 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 相同。

第三方依赖见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
