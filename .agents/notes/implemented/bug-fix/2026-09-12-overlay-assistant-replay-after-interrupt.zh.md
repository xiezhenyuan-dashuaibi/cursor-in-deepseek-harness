# Agent Note: Overlay 助手 fold 在打断通知之后仍接到同一条 band

Status: implemented

[English](2026-09-12-overlay-assistant-replay-after-interrupt.md) | 中文

## Problem

overlay transcript fold 只有在最后一条仍是正在流式的助手 band 时，才会把 assistant `stream-json` delta 接上去。`system/task_notification`、思考、工具行、出错的 `result`，以及断联之后 CLI `--resume`，都会插在同一条回复的片段之间。下一条助手事件于是新开一条 band。Cursor 常常把已经画过的前缀，或同一条消息的更长快照再发一遍。resume spawn 还会再发 `system/init` 和同一段 `user` 文本；第二条用户行会重置助手回看，面板就把同一段话画两次，而不是接着第一条继续。

## Decision

`foldCursorEvent` 在每个未结束的用户回合里只保留一条助手 band。它越过思考、工具和 system 通知，回看上一条用户行之后的最后一条助手。到来的文本无论是实时 delta 还是 resume 快照，都通过 `coalesceAssistantText` 接到那条 band：更长快照替换、重放前缀或已在 band 内的片段忽略、真正的 delta 追加。已经 settle 的 band 在 delta 恢复时重新打开 `streaming`。与该 band 没有共同前缀的 complete 载荷是第二条助手消息。

`hasMatchingRecentUser` 仍把模型回合之后、相同文本的 `user` 事件当作操作者的新提示。比最后一条助手/思考/工具行更新的 `system/init` 才标记该未结束回合的 CLI `--resume` 回放，不再开第二条用户行，随后的助手事件接到已有 band 上。更早那一回合的 init 不算。WebSocket 重连用 `{op:"snapshot"}` 里的事件走同一套 fold 重建。

相关：[Floating Cursor CLI overlay](../feature/2026-08-31-floating-cursor-cli-overlay.md)。

## Alternatives considered

**把 `system/task_notification` 藏起来，好让最后一条仍是助手。** 否决——通知可以继续显示；缺陷是新开第二条助手 band，不是画出通知。

**无条件拼到上一条助手，包括无关的 complete 载荷。** 否决——后面那条 complete 若不是同一条回复的延伸，必须仍是单独 band。

**去掉前缀，只把后缀作为新 band 画在通知下面。** 否决——操作者要的是一份完整输出，不是把同一条回复拆成两个助手气泡。

**把助手之后每一条相同文本的 `user` 都当成 resume 回放，或把历史上任意一次 `system/init` 都算进去。** 否决——操作者可以在已经有过 init 的完成回合之后再发一次相同提示；只有比最后一条模型行更新的 init 才标记 CLI `--resume` 回放。

## Consequences

被打断的 overlay 回复会在原来的助手 band 上继续变长。`task_notification`、思考、工具或断联 `--resume` 之后的重放不会把已经出现的段落再画一遍。操作者把同一段文本当作新提示发送时仍会再加一条用户行。同一用户回合里无关的 complete 助手消息仍会再加一条 band。若重试在最后一条模型行之后没有 init、却再次发出同一段 `user` 文本，仍会看成新提示。

## Testing

`packages/client/ui-cursor-agent/tests/chat-model.spec.ts` 会 fold 一条已 settle 的助手、两行 `system/task_notification`、思考、一条重放前缀 delta，以及更长的 complete 快照，并固定只有一条助手 band。同一文件会在已 settle 的助手之后 fold `system/init` 加上相同文本的 `user` 回放，并固定仍是一行用户和一条助手 band；没有比最后一条模型行更新的 init 时仍会再加一条用户行，包括第一回合已经有过 init 的情况。它还会从 `emptyChatFold()` 重建同一份 resume 事件列表，对应 `{op:"snapshot"}`。它还固定 `coalesceAssistantText`、直播流式前缀不会拼到 `Hello` 后面、`hasMatchingRecentUser` 在 assistant/thinking/tool 之后的 init，以及一条不同的 complete 消息成为第二条 band。
