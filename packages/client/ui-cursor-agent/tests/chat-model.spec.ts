import { describe, expect, it, beforeEach } from 'vitest'
import {
  coalesceAssistantText,
  countActiveTasks,
  emptyChatFold,
  foldCursorEvent,
  formatUsageLine,
  hasMatchingRecentUser,
  isAssistantDelta,
  messageText,
  parseTokenUsage,
  readTokenUsage,
  resetTurnIdsForTests,
  settleStreaming,
  toolCallFamily,
  toolCallIsBackground,
  toolCallName,
  toolCallTitle,
  toolHintFromDetail,
  type ChatFold,
} from '../src/client/chat-model.ts'

const usageLabels = {
  input: '输入',
  output: '输出',
  cacheRead: '缓存命中',
  cacheWrite: '缓存写入',
}

beforeEach(() => {
  resetTurnIdsForTests()
})

function fold(state: ChatFold, event: Record<string, unknown>): ChatFold {
  return foldCursorEvent(state, event)
}

describe('messageText / toolCallName / isAssistantDelta', () => {
  it('extracts text parts and tool names', () => {
    expect(messageText({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] })).toBe('ab')
    expect(messageText(null)).toBe('')
    expect(messageText({})).toBe('')
    expect(messageText({ content: [null, 'x', { text: 1 }] })).toBe('')
    expect(toolCallName({ readToolCall: { args: { path: 'x' } } })).toBe('read')
    expect(toolCallName({ function: { name: 'dsh_skill' } })).toBe('dsh_skill')
    expect(toolCallName({ function: { name: '' } })).toBe('function')
    expect(toolCallName({ function: {} })).toBe('function')
    expect(toolCallName({ function: null })).toBe('function')
    expect(toolCallName({ other: true })).toBe('tool')
    expect(toolCallName(null)).toBe('tool')
    expect(isAssistantDelta({ type: 'assistant', timestamp_ms: 1 })).toBe(true)
    expect(isAssistantDelta({ type: 'assistant', timestamp_ms: 1, model_call_id: 'm' })).toBe(false)
    expect(isAssistantDelta({ type: 'assistant' })).toBe(false)
    expect(isAssistantDelta({ type: 'user', timestamp_ms: 1 })).toBe(false)
    expect(coalesceAssistantText('', 'Hi')).toBe('Hi')
    expect(coalesceAssistantText('Hi', '')).toBe('Hi')
    expect(coalesceAssistantText('Hello', 'Hello')).toBe('Hello')
    expect(coalesceAssistantText('Hello', 'Hello world')).toBe('Hello world')
    expect(coalesceAssistantText('Hello world', 'Hello')).toBe('Hello world')
    expect(coalesceAssistantText('already has replayed chunk here', 'replayed chunk')).toBe(
      'already has replayed chunk here',
    )
    expect(coalesceAssistantText('Hello', ' world')).toBe('Hello world')
  })
})

describe('parseTokenUsage / readTokenUsage / formatUsageLine', () => {
  it('copies finite named fields and does not invent a total', () => {
    expect(parseTokenUsage(null)).toBeUndefined()
    expect(parseTokenUsage({ inputTokens: '1' })).toBeUndefined()
    expect(parseTokenUsage({ inputTokens: Number.NaN, outputTokens: 2 })).toEqual({ outputTokens: 2 })
    expect(readTokenUsage({ type: 'assistant' })).toBeUndefined()
    expect(readTokenUsage({
      type: 'result',
      usage: { inputTokens: 10, outputTokens: 4, cacheReadTokens: 8, cacheWriteTokens: 0 },
    })).toEqual({
      inputTokens: 10,
      outputTokens: 4,
      cacheReadTokens: 8,
      cacheWriteTokens: 0,
    })
    expect(readTokenUsage({ type: 'usage', inputTokens: 3 })).toEqual({ inputTokens: 3 })
    expect(readTokenUsage({ type: 'usage', usage: { outputTokens: 7 } })).toEqual({ outputTokens: 7 })
    expect(formatUsageLine({}, usageLabels)).toBe('')
    expect(formatUsageLine({ inputTokens: 10, outputTokens: 4 }, usageLabels)).toBe('输入 10 · 输出 4')
  })
})

describe('foldCursorEvent', () => {
  it('folds user, streaming assistant, thinking, tool, usage, and settles', () => {
    let state = fold(emptyChatFold(), {
      type: 'user',
      message: { content: [{ type: 'text', text: 'hi' }] },
    })
    expect(state.turns).toEqual([{ id: 'turn-1', role: 'user', text: 'hi' }])
    state = fold(state, {
      type: 'user',
      message: { content: [{ type: 'text', text: 'hi' }] },
    })
    expect(state.turns).toHaveLength(1)
    state = fold(state, { type: 'system', subtype: 'init', model: 'Auto' })
    state = fold(state, {
      type: 'user',
      message: { content: [{ type: 'text', text: 'hi' }] },
    })
    expect(state.turns).toHaveLength(2)
    expect(state.turns.map(turn => turn.role)).toEqual(['user', 'activity'])
    state = fold(state, {
      type: 'thinking',
      subtype: 'delta',
      text: 'plan',
    })
    state = fold(state, {
      type: 'thinking',
      subtype: 'delta',
      text: 'ning',
    })
    expect(state.turns.at(-1)).toMatchObject({ role: 'thinking', text: 'planning', streaming: true })
    state = fold(state, { type: 'thinking', subtype: 'completed' })
    expect(state.turns.at(-1)).toMatchObject({ role: 'thinking', text: 'planning' })
    expect((state.turns.at(-1) as { streaming?: boolean }).streaming).toBeUndefined()
    state = fold(state, {
      type: 'assistant',
      timestamp_ms: 1,
      message: { content: [{ type: 'text', text: 'Hel' }] },
    })
    state = fold(state, {
      type: 'assistant',
      timestamp_ms: 2,
      message: { content: [{ type: 'text', text: 'lo' }] },
    })
    expect(state.turns.at(-1)).toMatchObject({ role: 'assistant', text: 'Hello', streaming: true })
    state = fold(state, {
      type: 'tool_call',
      subtype: 'started',
      call_id: 'c1',
      tool_call: { readToolCall: { args: { path: 'a' } } },
    })
    expect(state.turns.find(t => t.role === 'tool')).toMatchObject({
      status: 'running',
      name: 'read',
      family: 'generic',
      detail: '{"path":"a"}',
    })
    state = fold(state, {
      type: 'tool_call',
      subtype: 'completed',
      call_id: 'c1',
      tool_call: { readToolCall: { result: { success: true } } },
    })
    expect(state.turns.find(t => t.role === 'tool')).toMatchObject({
      status: 'done',
      name: 'read',
      detail: '{"success":true}',
    })
    state = fold(state, {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hello done' }] },
    })
    expect(state.turns.filter(t => t.role === 'assistant').at(-1)).toMatchObject({
      role: 'assistant',
      text: 'Hello done',
    })
    state = fold(state, {
      type: 'result',
      subtype: 'success',
      is_error: false,
      usage: { inputTokens: 12, outputTokens: 3, cacheReadTokens: 8, cacheWriteTokens: 0 },
    })
    expect(state.usage).toEqual({
      inputTokens: 12,
      outputTokens: 3,
      cacheReadTokens: 8,
      cacheWriteTokens: 0,
    })
    state = settleStreaming(state)
    expect(state.turns.filter(t => t.role === 'assistant')).toHaveLength(1)
    expect(state.turns.find(t => t.role === 'assistant')).toMatchObject({ text: 'Hello done' })
  })

  it('keeps usage across later turns and ignores empty payloads', () => {
    let state = fold(emptyChatFold(), {
      type: 'result',
      usage: { inputTokens: 1 },
    })
    expect(state.usage).toEqual({ inputTokens: 1 })
    state = fold(state, { type: 'user', message: { content: [] } })
    state = fold(state, { type: 'assistant', timestamp_ms: 1, message: { content: [] } })
    state = fold(state, { type: 'thinking', subtype: 'delta', text: '' })
    state = fold(state, { type: 'thinking', subtype: 'completed' })
    expect(state.turns).toEqual([])
    expect(state.usage).toEqual({ inputTokens: 1 })
  })

  it('shows a running tool immediately and still paints a completed tool without a start', () => {
    let state = fold(emptyChatFold(), {
      type: 'tool_call',
      subtype: 'started',
      call_id: 'c2',
      tool_call: { writeToolCall: { args: { path: 'b' } } },
    })
    expect(state.turns).toMatchObject([{ role: 'tool', status: 'running', name: 'write' }])
    state = fold(state, {
      type: 'tool_call',
      subtype: 'started',
      call_id: 'c2',
      tool_call: { writeToolCall: { args: { path: 'b2' } } },
    })
    expect(state.turns).toHaveLength(1)
    expect(state.turns[0]).toMatchObject({ detail: '{"path":"b2"}' })
    state = fold(emptyChatFold(), {
      type: 'tool_call',
      subtype: 'completed',
      call_id: 'late',
      is_error: true,
      tool_call: { shellToolCall: { result: { exit: 1 } } },
    })
    expect(state.turns).toMatchObject([{
      role: 'tool',
      status: 'error',
      name: 'shell',
      detail: '{"exit":1}',
    }])
  })

  it('does not reopen a finished tool card when a late started event arrives', () => {
    let state = fold(emptyChatFold(), {
      type: 'tool_call',
      subtype: 'completed',
      call_id: 'done',
      tool_call: { readToolCall: { result: { ok: true } } },
    })
    state = fold(state, {
      type: 'tool_call',
      subtype: 'started',
      call_id: 'done',
      tool_call: { readToolCall: { args: { path: 'z' } } },
    })
    expect(state.turns).toMatchObject([{ status: 'done' }])
  })

  it('folds system init, unknown types, result errors, and usage events', () => {
    let state = fold(emptyChatFold(), { type: 'system', subtype: 'init', model: 'Auto' })
    expect(state.turns).toEqual([{ id: 'turn-1', role: 'activity', kind: 'init', label: 'Auto' }])
    state = fold(emptyChatFold(), { type: 'system', subtype: 'init' })
    expect(state.turns).toMatchObject([{ kind: 'init', label: '' }])
    state = fold(emptyChatFold(), { type: 'system', subtype: 'notice' })
    expect(state.turns).toMatchObject([{ kind: 'notice', label: 'system/notice' }])
    state = fold(emptyChatFold(), { type: 'system' })
    expect(state.turns).toMatchObject([{ kind: 'notice', label: 'system' }])
    state = fold(emptyChatFold(), { type: 'widget', subtype: 'tick' })
    expect(state.turns).toMatchObject([{ kind: 'notice', label: 'widget/tick' }])
    state = fold(emptyChatFold(), { type: 'widget' })
    expect(state.turns).toMatchObject([{ kind: 'notice', label: 'widget' }])
    state = fold(emptyChatFold(), { type: 'result', is_error: true })
    expect(state.turns).toMatchObject([{ role: 'system', text: 'Turn failed' }])
    state = fold(emptyChatFold(), { type: 'result', is_error: true, result: 'boom' })
    expect(state.turns).toMatchObject([{ role: 'system', text: 'boom' }])
    state = fold(emptyChatFold(), { type: 'usage', inputTokens: 9 })
    expect(state.usage).toEqual({ inputTokens: 9 })
    expect(fold(emptyChatFold(), {}).turns).toEqual([])
    expect(fold(emptyChatFold(), { type: 'usage', usage: {} }).usage).toBeUndefined()
    const noResult = fold(emptyChatFold(), {
      type: 'tool_call',
      subtype: 'completed',
      call_id: 'bare',
      tool_call: null,
    })
    expect(noResult.turns).toMatchObject([{ role: 'tool', name: 'tool', status: 'done', detail: 'null' }])
    const noPayload = fold(emptyChatFold(), {
      type: 'tool_call',
      subtype: 'completed',
      call_id: 'empty',
    })
    expect((noPayload.turns[0] as { detail?: string }).detail).toBeUndefined()
  })

  it('replaces a streaming assistant band with the complete message', () => {
    let state = fold(emptyChatFold(), {
      type: 'assistant',
      timestamp_ms: 1,
      message: { content: [{ type: 'text', text: 'Hel' }] },
    })
    state = fold(state, {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hello world' }] },
    })
    expect(state.turns).toEqual([{ id: 'turn-1', role: 'assistant', text: 'Hello world' }])
    state = fold(emptyChatFold(), {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'only' }] },
    })
    expect(state.turns).toEqual([{ id: 'turn-2', role: 'assistant', text: 'only' }])
  })

  it('extends the same assistant band after thinking and task_notification', () => {
    let state = fold(emptyChatFold(), {
      type: 'assistant',
      timestamp_ms: 1,
      message: { content: [{ type: 'text', text: '两件都已经挂到当前 overlay 上了。' }] },
    })
    state = fold(state, { type: 'result', subtype: 'success' })
    expect(state.turns).toMatchObject([{ role: 'assistant', text: '两件都已经挂到当前 overlay 上了。' }])
    expect((state.turns[0] as { streaming?: boolean }).streaming).toBeUndefined()
    state = fold(state, { type: 'system', subtype: 'task_notification' })
    state = fold(state, { type: 'system', subtype: 'task_notification' })
    state = fold(state, { type: 'thinking', subtype: 'delta', text: 'check' })
    state = fold(state, {
      type: 'assistant',
      timestamp_ms: 2,
      message: { content: [{ type: 'text', text: '两件都已经挂到当前 overlay 上了。' }] },
    })
    expect(state.turns.filter(t => t.role === 'assistant')).toHaveLength(1)
    expect(state.turns.find(t => t.role === 'assistant')).toMatchObject({
      text: '两件都已经挂到当前 overlay 上了。',
      streaming: true,
    })
    state = fold(state, {
      type: 'assistant',
      timestamp_ms: 3,
      message: { content: [{ type: 'text', text: '卡片插入已经跑完。' }] },
    })
    expect(state.turns.filter(t => t.role === 'assistant')).toHaveLength(1)
    expect(state.turns.find(t => t.role === 'assistant')).toMatchObject({
      text: '两件都已经挂到当前 overlay 上了。卡片插入已经跑完。',
      streaming: true,
    })
    state = fold(state, {
      type: 'assistant',
      message: {
        content: [{
          type: 'text',
          text: '两件都已经挂到当前 overlay 上了。卡片插入已经跑完。',
        }],
      },
    })
    expect(state.turns.filter(t => t.role === 'assistant')).toHaveLength(1)
    expect(state.turns.find(t => t.role === 'assistant')).toMatchObject({
      text: '两件都已经挂到当前 overlay 上了。卡片插入已经跑完。',
    })
    expect((state.turns.find(t => t.role === 'assistant') as { streaming?: boolean }).streaming)
      .toBeUndefined()
  })

  it('opens a second assistant band only for a distinct complete message', () => {
    let state = fold(emptyChatFold(), {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'first' }] },
    })
    state = fold(state, {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'unrelated later' }] },
    })
    expect(state.turns.map(turn => turn.role === 'assistant' ? turn.text : turn.role)).toEqual([
      'first',
      'unrelated later',
    ])
  })

  it('ignores a duplicate complete snapshot of the same assistant text', () => {
    const once = fold(emptyChatFold(), {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'already has replayed chunk here' }] },
    })
    expect(fold(once, {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'already has replayed chunk here' }] },
    })).toBe(once)
    expect(fold(once, {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'replayed chunk' }] },
    })).toBe(once)
  })

  it('keeps one assistant band across CLI resume replay after disconnect', () => {
    let state = fold(emptyChatFold(), {
      type: 'user',
      message: { content: [{ type: 'text', text: 'hi' }] },
    })
    state = fold(state, {
      type: 'assistant',
      timestamp_ms: 1,
      message: { content: [{ type: 'text', text: 'Hello' }] },
    })
    state = fold(state, { type: 'result', subtype: 'success' })
    expect((state.turns.find(t => t.role === 'assistant') as { streaming?: boolean }).streaming)
      .toBeUndefined()
    state = fold(state, { type: 'system', subtype: 'init', model: 'Auto' })
    state = fold(state, {
      type: 'user',
      message: { content: [{ type: 'text', text: 'hi' }] },
    })
    expect(state.turns.filter(t => t.role === 'user')).toHaveLength(1)
    state = fold(state, {
      type: 'assistant',
      timestamp_ms: 2,
      message: { content: [{ type: 'text', text: 'Hel' }] },
    })
    state = fold(state, {
      type: 'assistant',
      timestamp_ms: 3,
      message: { content: [{ type: 'text', text: 'Hello world' }] },
    })
    expect(state.turns.filter(t => t.role === 'assistant')).toHaveLength(1)
    expect(state.turns.find(t => t.role === 'assistant')).toMatchObject({
      text: 'Hello world',
      streaming: true,
    })
  })

  it('still opens a new user turn when the operator resends the same text', () => {
    let state = fold(emptyChatFold(), {
      type: 'user',
      message: { content: [{ type: 'text', text: 'hi' }] },
    })
    state = fold(state, { type: 'system', subtype: 'init', model: 'Auto' })
    state = fold(state, {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'yo' }] },
    })
    state = fold(state, { type: 'result', subtype: 'success' })
    state = fold(state, {
      type: 'user',
      message: { content: [{ type: 'text', text: 'hi' }] },
    })
    expect(state.turns.filter(t => t.role === 'user')).toHaveLength(2)
  })

  it('rebuilds one assistant band when a snapshot replays resume events from empty', () => {
    const events: Record<string, unknown>[] = [
      { type: 'user', message: { content: [{ type: 'text', text: 'hi' }] } },
      {
        type: 'assistant',
        timestamp_ms: 1,
        message: { content: [{ type: 'text', text: 'Hello' }] },
      },
      { type: 'result', subtype: 'success' },
      { type: 'system', subtype: 'init', model: 'Auto' },
      { type: 'user', message: { content: [{ type: 'text', text: 'hi' }] } },
      {
        type: 'assistant',
        timestamp_ms: 2,
        message: { content: [{ type: 'text', text: 'Hello' }] },
      },
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Hello world' }] },
      },
    ]
    const state = events.reduce(fold, emptyChatFold())
    expect(state.turns.filter(t => t.role === 'user')).toHaveLength(1)
    expect(state.turns.filter(t => t.role === 'assistant')).toHaveLength(1)
    expect(state.turns.find(t => t.role === 'assistant')).toMatchObject({
      text: 'Hello world',
    })
  })

  it('does not append a replayed streaming prefix onto the live assistant band', () => {
    let state = fold(emptyChatFold(), {
      type: 'assistant',
      timestamp_ms: 1,
      message: { content: [{ type: 'text', text: 'Hello' }] },
    })
    state = fold(state, {
      type: 'assistant',
      timestamp_ms: 2,
      message: { content: [{ type: 'text', text: 'Hel' }] },
    })
    expect(state.turns).toMatchObject([{ role: 'assistant', text: 'Hello', streaming: true }])
  })

  it('truncates long tool JSON and skips non-JSON details', () => {
    const long = { path: 'x'.repeat(200) }
    const state = fold(emptyChatFold(), {
      type: 'tool_call',
      subtype: 'started',
      call_id: 'long',
      tool_call: { readToolCall: { args: long } },
    })
    const detail = (state.turns[0] as { detail?: string }).detail
    expect(detail?.endsWith('…')).toBe(true)
    expect(detail?.length).toBe(161)
    const skipped = fold(emptyChatFold(), {
      type: 'tool_call',
      subtype: 'started',
      call_id: 'fn',
      tool_call: { readToolCall: { args: () => undefined } },
    })
    expect((skipped.turns[0] as { detail?: string }).detail).toBeUndefined()
    const noArgs = fold(emptyChatFold(), {
      type: 'tool_call',
      tool_call: { readToolCall: {} },
    })
    expect(noArgs.turns).toMatchObject([{ role: 'tool', status: 'running', name: 'read' }])
    const minted = fold(emptyChatFold(), {
      type: 'tool_call',
      subtype: 'started',
      tool_call: { readToolCall: { args: { path: 'n' } } },
    })
    expect(minted.turns[0]?.id.startsWith('tool-')).toBe(true)
  })

  it('settles streaming thinking when the host goes idle', () => {
    let state = fold(emptyChatFold(), { type: 'thinking', subtype: 'delta', text: '…' })
    state = settleStreaming(state)
    expect(state.turns).toEqual([{ id: 'turn-1', role: 'thinking', text: '…' }])
  })
})

describe('hasMatchingRecentUser', () => {
  it('matches a prior user through trailing activity and other user rows', () => {
    expect(hasMatchingRecentUser([
      { id: '1', role: 'user', text: 'hi' },
      { id: '2', role: 'activity', kind: 'init', label: 'Auto' },
    ], 'hi')).toBe(true)
    expect(hasMatchingRecentUser([
      { id: '1', role: 'user', text: 'first' },
      { id: '2', role: 'user', text: 'queued next' },
      { id: '3', role: 'activity', kind: 'init', label: 'Auto' },
    ], 'first')).toBe(true)
    expect(hasMatchingRecentUser([
      { id: '1', role: 'user', text: 'hi' },
      { id: '2', role: 'assistant', text: 'yo' },
    ], 'hi')).toBe(false)
    expect(hasMatchingRecentUser([
      { id: '1', role: 'user', text: 'hi' },
      { id: '2', role: 'assistant', text: 'yo' },
      { id: '3', role: 'activity', kind: 'init', label: 'Auto' },
    ], 'hi')).toBe(true)
    expect(hasMatchingRecentUser([
      { id: '1', role: 'user', text: 'hi' },
      { id: '2', role: 'thinking', text: 'plan', streaming: true },
      { id: '3', role: 'activity', kind: 'init', label: 'Auto' },
    ], 'hi')).toBe(true)
    expect(hasMatchingRecentUser([
      { id: '1', role: 'user', text: 'hi' },
      {
        id: '2',
        role: 'tool',
        name: 'read',
        status: 'done',
        family: 'generic',
      },
      { id: '3', role: 'activity', kind: 'notice', label: 'system/task_notification' },
      { id: '4', role: 'activity', kind: 'init', label: 'Auto' },
    ], 'hi')).toBe(true)
    expect(hasMatchingRecentUser([
      { id: '1', role: 'user', text: 'hi' },
      { id: '2', role: 'activity', kind: 'init', label: 'Auto' },
      { id: '3', role: 'assistant', text: 'yo' },
    ], 'hi')).toBe(false)
    expect(hasMatchingRecentUser([], 'hi')).toBe(false)
    expect(hasMatchingRecentUser([
      { id: '1', role: 'system', text: 'boom' },
    ], 'hi')).toBe(false)
  })
})

describe('toolHintFromDetail', () => {
  it('prefers path-like fields and clips long plain text', () => {
    expect(toolHintFromDetail('{"path":"src/a.ts"}')).toBe('src/a.ts')
    expect(toolHintFromDetail('{"pattern":"foo"}')).toBe('foo')
    expect(toolHintFromDetail(undefined)).toBe('')
    expect(toolHintFromDetail('x'.repeat(80)).endsWith('…')).toBe(true)
  })
})

describe('task tool folding', () => {
  it('classifies task/shell families and counts background agents', () => {
    expect(toolCallFamily({ taskToolCall: { args: { description: '盘点' } } })).toBe('task')
    expect(toolCallFamily({ shellToolCall: { args: { command: 'ls' } } })).toBe('shell')
    expect(toolCallTitle({ taskToolCall: { args: { description: '盘点 Cursor 技能' } } }))
      .toBe('盘点 Cursor 技能')
    expect(toolCallIsBackground({
      taskToolCall: { result: { success: { is_background: true, agent_id: 'a1' } } },
    })).toBe(true)

    let state = fold(emptyChatFold(), {
      type: 'tool_call',
      subtype: 'started',
      call_id: 't1',
      tool_call: { taskToolCall: { args: { description: '盘点 Cursor 技能', prompt: 'list' } } },
    })
    state = fold(state, {
      type: 'tool_call',
      subtype: 'started',
      call_id: 't2',
      tool_call: { taskToolCall: { args: { description: '盘点钉钉 DWS 技能' } } },
    })
    expect(countActiveTasks(state.turns)).toBe(2)
    expect(state.turns[0]).toMatchObject({
      family: 'task',
      title: '盘点 Cursor 技能',
      status: 'running',
    })
    state = fold(state, {
      type: 'tool_call',
      subtype: 'completed',
      call_id: 't1',
      tool_call: {
        taskToolCall: {
          args: { description: '盘点 Cursor 技能' },
          result: { success: { is_background: true, agent_id: 'a1' } },
        },
      },
    })
    expect(state.turns[0]).toMatchObject({ background: true, status: 'done' })
    expect(countActiveTasks(state.turns)).toBe(2)
  })
})
