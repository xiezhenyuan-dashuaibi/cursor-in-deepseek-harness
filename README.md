# Cursor in DeepSeek Harness

English | [中文](README.zh.md)

This is a **personal** project. It floats the Cursor CLI on DeepSeek Harness `dsh web` as a glass conversation card. It is not an official DeepSeek AI product and not an official Cursor / Anysphere product.

## What you get

- A title-less Cursor chat card on `dsh web` (sessions, queue, slash menus, AskQuestion including Other and CJK IME)
- Live overlay cards you can hide or unplug from the left rail
- Overlay Cursor extras (`dsh_skill`, `dsh_system_prompt`) on the floating CLI

## Upstream

The tree includes [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (MIT) as the host. Official DSH stays at that repository.

## Run from source

Needs Node.js `^22.19 || >=24`, [pnpm](https://pnpm.io) 11, and a signed-in [Cursor CLI](https://cursor.com).

```sh
git clone https://github.com/xiezhenyuan-dashuaibi/cursor-in-deepseek-harness.git
cd cursor-in-deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

Open `http://127.0.0.1:3080/`. The overlay skips the DeepSeek API-key onboarding dialog.

## License

[MIT](LICENSE), same as upstream DeepSeek Harness.

Third-party dependencies: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
