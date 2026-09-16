# Agent Note: Overlay 助手 fold 在打断通知之后仍接到同一条 band

Status: implemented

[English](2026-09-12-overlay-assistant-replay-after-interrupt.md) | 中文

## Problem

overlay transcript fold 只有在最后一条仍是正在流式的助手 band 时，才会把 assistant `stream-json` delta 接上去。`system/task_notification`、思考、工具行、出错的 `result`，以及断联之后 CLI `--resume`，都会插在同一条回复的片段之间。下一条助手事件于是新开一条 band。Cursor 常常把已经画过的前缀，或同一条消息的更长快照再发一遍。resume spawn 还会再发 `system/init` 和同一段 `user` 文本；第二条用户行会重置助手回看，面板就把同一段话画两次，而不是接着第一条继续。若把后到的快照写回更早那条助手，思考和工具就会画在答案下面；把挤成一行的草稿和排版终稿拼在一起，会变成一团无法渲染的正文。最终答案已经画在屏幕上之后，思考或工具仍可能停在「运行中」。

## Decision

`foldCursorEvent` 只改最后一条助手。思考、工具和 system 通知保持事件顺序。这些行之后再来的助手事件在末尾新开一条 band；若是同一条回复，就删掉前面的助手草稿，步骤留在答案上面。最后一条上的文本走 `coalesceAssistantText`：更长快照替换、重放前缀或已在 band 内的片段忽略、同一开头的乱表和排版表留后到的那份、开头不同的挤成一行草稿只要后到文本重复了其中两句或以上也留后到的那份、真正的 delta 追加。complete 载荷或 `settleStreaming` 时，`collapseReplayedAssistantText` 仍会拆开同一字段里已经拼上的重启。已经 settle 的最后一条在 delta 恢复时重新打开 `streaming`。与该最后一条没有共同前缀的 complete 载荷是第二条助手消息。

complete 载荷同时收掉思考的「运行中」。`result` / idle 还会把仍停在 running 的工具标成 done。

`hasMatchingRecentUser` 仍把模型回合之后、相同文本的 `user` 事件当作操作者的新提示。比最后一条助手/思考/工具行更新的 `system/init` 才标记该未结束回合的 CLI `--resume` 回放，不再开第二条用户行。更早那一回合的 init 不算。WebSocket 重连用 `{op:"snapshot"}` 里的事件走同一套 fold 重建。

相关：[Floating Cursor CLI overlay](../feature/2026-08-31-floating-cursor-cli-overlay.md)。

## Alternatives considered

**把 `system/task_notification` 藏起来，好让最后一条仍是助手。** 否决——通知可以继续显示；缺陷是把最终答案画两遍，不是画出通知。

**越过思考/工具，把后到快照写进更早那条助手。** 否决——思考和工具会被画在已经完成的答案下面。

**前缀对不上就一律拼接。** 否决——挤成一行的表和带空格的 GFM 表开头相同但不是彼此的前缀，拼接会把无法阅读的草稿粘在排版终稿前面。

**无条件拼到上一条助手，包括无关的 complete 载荷。** 否决——后面那条 complete 若不是同一条回复的延伸，必须仍是单独 band。

**去掉前缀，只把后缀作为新 band 画在通知下面。** 否决——操作者要的是一份完整输出，不是把同一条回复拆成两个助手气泡。

**把助手之后每一条相同文本的 `user` 都当成 resume 回放，或把历史上任意一次 `system/init` 都算进去。** 否决——操作者可以在已经有过 init 的完成回合之后再发一次相同提示；只有比最后一条模型行更新的 init 才标记 CLI `--resume` 回放。

**按每个字符扫描最长重复前缀。** 否决——操作者要求回合结束后按「一段」删掉重放，而不是改写直播 token 流。

## Consequences

思考和工具行保持它们到达的顺序。同一条回复的后到快照会删掉前面的助手草稿，而不是写进那个更早的槽位。同一开头的乱表和排版表留后到的那份。开头不同的挤成一行草稿，只要后到的那份重复了其中两句或以上，也删掉前面那份。同一用户回合里无关的 complete 助手消息仍会再加一条 band。回合 settle 之后，仍停在 running 的工具在 `result` / idle 时 settle。操作者把同一段文本当作新提示发送时仍会再加一条用户行。若重试在最后一条模型行之后没有 init、却再次发出同一段 `user` 文本，仍会看成新提示。后面若引用了前面不少于 32 个字符的一段，也可能把前面那份删掉。

## Testing

`packages/client/ui-cursor-agent/tests/chat-model.spec.ts` 会 fold 一条已 settle 的助手、两行 `system/task_notification`、思考和一条重放快照，并固定思考在一条助手 band 上面。同一文件会 fold 乱表、思考、工具和排版快照，并固定顺序为 `thinking, tool, assistant` 且只留排版那份。同一文件会把开头不同的挤成一行草稿收成排版终稿，包括粘在同一字段里，以及思考夹在两条 band 之间。同一文件会在已 settle 的助手之后 fold `system/init` 加上相同文本的 `user` 回放，并固定仍是一行用户和一条助手 band；没有比最后一条模型行更新的 init 时仍会再加一条用户行，包括第一回合已经有过 init 的情况。它还会从 `emptyChatFold()` 重建同一份 resume 事件列表，对应 `{op:"snapshot"}`。它固定 `collapseReplayedAssistantText` 对重复句子的处理、挤在排版表前面的乱表、本会拼出重叠段落的 complete 载荷收成一份终稿、`settleStreaming` 折叠直播拼上的重放、complete 助手收掉思考，以及 `result` 把 running 工具标成 done。它还固定 `coalesceAssistantText` 用排版表替换乱表、直播流式前缀不会拼到 `Hello` 后面、`hasMatchingRecentUser` 在 assistant/thinking/tool 之后的 init，以及一条不同的 complete 消息成为第二条 band。
