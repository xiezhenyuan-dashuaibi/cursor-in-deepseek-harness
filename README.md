# Cursor in DeepSeek Harness

English | [中文](README.zh.md)

DeepSeek Harness is powerful.

But DeepSeek V4 Flash, The model still isn't really there.

If you pay for Cursor, you will probably like this. It puts Cursor inside DeepSeek Harness, keeps the parts of DSH that are actually good, and brings the Cursor terminal along with it. Frontend shell, hooked into `dsh web`.

Plugins are easy to insert while you work, and you manage them in one place. You don't have to finish it in one shot. It can keep growing.

Personal project. Not DeepSeek, not Cursor. Models and quota come from your Cursor account.

## Run from source

Needs Node.js `^22.19 || >=24`, [pnpm](https://pnpm.io) 11, and a signed-in [Cursor CLI](https://cursor.com).

```sh
git clone https://github.com/xiezhenyuan-dashuaibi/cursor-in-deepseek-harness.git
cd cursor-in-deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

Open `http://127.0.0.1:3080/` in a browser.

## License

[MIT](LICENSE), same as upstream [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

Third-party dependencies: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
