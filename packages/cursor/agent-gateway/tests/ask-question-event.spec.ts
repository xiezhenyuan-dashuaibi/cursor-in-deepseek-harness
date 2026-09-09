import { describe, expect, it } from 'vitest'
import {
  applyAskQuestionKey,
  ASK_QUESTION_SKIP_MARKER,
  createAskQuestionUi,
  formatAskQuestionAnswers,
  FREEFORM_OPTION_ID,
  isAskQuestionSkipResult,
  projectAskQuestionMirror,
  readAskQuestionForm,
} from '../src/ask-question-event.ts'

const ESC = '\u001b'
const ARROW_UP = `${ESC}[A`
const ARROW_DOWN = `${ESC}[B`

const FORM = {
  title: 'dinner',
  questions: [
    {
      id: 'food',
      prompt: 'what to eat',
      allowMultiple: true,
      options: [
        { id: 'hotpot', label: 'hotpot' },
        { id: 'noodles', label: 'noodles' },
      ],
    },
    {
      id: 'drink',
      prompt: 'what to drink',
      allowMultiple: false,
      options: [{ id: 'tea', label: 'tea' }],
    },
  ],
}

describe('readAskQuestionForm', () => {
  it('reads askQuestionToolCall args and function JSON arguments', () => {
    const fromTool = readAskQuestionForm({
      type: 'tool_call',
      subtype: 'started',
      tool_call: {
        askQuestionToolCall: {
          args: {
            title: 'dinner',
            questions: [{
              id: 'food',
              prompt: 'what to eat',
              allow_multiple: true,
              options: [
                { id: 'hotpot', label: 'hotpot' },
                'noodles',
              ],
            }],
          },
        },
      },
    })
    expect(fromTool?.title).toBe('dinner')
    expect(fromTool?.questions[0]?.allowMultiple).toBe(true)
    expect(fromTool?.questions[0]?.options.map(item => item.label)).toEqual([
      'hotpot',
      'noodles',
      'Other',
    ])
    expect(fromTool?.questions[0]?.options.at(-1)?.id).toBe(FREEFORM_OPTION_ID)

    const fromFn = readAskQuestionForm({
      type: 'tool_call',
      tool_call: {
        function: {
          name: 'AskQuestion',
          arguments: JSON.stringify({
            title: 't',
            questions: [{ question: 'q', options: [{ text: 'a' }] }],
          }),
        },
      },
    })
    expect(fromFn?.questions[0]?.prompt).toBe('q')
    expect(fromFn?.questions[0]?.id).toBe('q1')
    expect(fromFn?.questions[0]?.options[0]).toEqual({ id: 'o1', label: 'a' })
    expect(fromFn?.questions[0]?.options.at(-1)).toEqual({
      id: FREEFORM_OPTION_ID,
      label: 'Other',
    })

    expect(readAskQuestionForm({
      type: 'tool_call',
      tool_call: {
        function: {
          name: 'ask_user_question',
          arguments: {
            title: 'obj',
            questions: [{ prompt: 'p', allowMultiple: true, options: [{ id: 'a', label: 'A' }] }],
          },
        },
      },
    })?.title).toBe('obj')

    const unnamed = readAskQuestionForm({
      type: 'tool_call',
      tool_call: {
        otherToolCall: {
          args: {
            questions: [{ prompt: 'only-shape', options: [{ name: 'x' }] }],
          },
        },
      },
    })
    expect(unnamed?.questions[0]?.prompt).toBe('only-shape')
  })

  it('rejects non-AskQuestion events and broken payloads', () => {
    expect(readAskQuestionForm({ type: 'assistant' })).toBeUndefined()
    expect(readAskQuestionForm({ type: 'tool_call', tool_call: null })).toBeUndefined()
    expect(readAskQuestionForm({
      type: 'tool_call',
      tool_call: { function: { name: 'AskQuestion', arguments: '{' } },
    })).toBeUndefined()
    expect(readAskQuestionForm({
      type: 'tool_call',
      tool_call: { function: { arguments: { title: 't' } } },
    })).toBeUndefined()
    expect(readAskQuestionForm({
      type: 'tool_call',
      tool_call: { askQuestionToolCall: { args: { questions: [null, { prompt: 'x' }] } } },
    })).toBeUndefined()
    expect(readAskQuestionForm({
      type: 'tool_call',
      tool_call: {
        shellToolCall: { args: { command: 'ls' } },
      },
    })).toBeUndefined()
    expect(readAskQuestionForm({
      type: 'tool_call',
      tool_call: { function: { name: 'AskQuestion' }, extra: 'x' },
    })).toBeUndefined()
    expect(readAskQuestionForm({
      type: 'tool_call',
      tool_call: { payload: { questions: [] } },
    })).toBeUndefined()
    expect(readAskQuestionForm({
      type: 'tool_call',
      tool_call: { function: { name: 'AskQuestion', arguments: { title: 't' } } },
    })).toBeUndefined()
    expect(readAskQuestionForm({
      type: 'tool_call',
      tool_call: { function: { name: 'AskQuestion', arguments: 5 } },
    })).toBeUndefined()
    expect(readAskQuestionForm({
      type: 'tool_call',
      tool_call: {
        function: {
          name: 'AskQuestion',
          arguments: { questions: [{ prompt: 'x', options: [null, { text: '' }] }] },
        },
      },
    })).toBeUndefined()
    expect(readAskQuestionForm({
      type: 'tool_call',
      tool_call: { function: 'AskQuestion' },
    })).toBeUndefined()
    expect(applyAskQuestionKey(FORM, {
      questionIndex: 0,
      optionIndex: 0,
      selected: {},
    }, ' ').kind).toBe('update')
  })
})

describe('isAskQuestionSkipResult', () => {
  it('matches completed skip text and ignores started calls', () => {
    expect(isAskQuestionSkipResult({ type: 'assistant' })).toBe(false)
    expect(isAskQuestionSkipResult({
      type: 'tool_call',
      subtype: 'started',
      tool_call: { askQuestionToolCall: { args: {} } },
    })).toBe(false)
    expect(isAskQuestionSkipResult({
      type: 'tool_call',
      subtype: 'in_progress',
      tool_call: {},
    })).toBe(false)
    expect(isAskQuestionSkipResult({
      type: 'tool_call',
      subtype: 'completed',
      tool_call: { askQuestionToolCall: { result: ASK_QUESTION_SKIP_MARKER } },
    })).toBe(true)
  })
})

describe('AskQuestion key loop', () => {
  it('moves, toggles, advances, submits, and dismisses', () => {
    let ui = createAskQuestionUi(FORM)
    const painted = projectAskQuestionMirror(FORM, ui)
    expect(painted.below[0]?.text).toBe('AskQuestion dinner')
    expect(painted.below.some(row => row.highlighted && row.text.includes('hotpot'))).toBe(true)

    ui = (applyAskQuestionKey(FORM, ui, ARROW_DOWN) as { ui: typeof ui }).ui
    ui = (applyAskQuestionKey(FORM, ui, ' ') as { ui: typeof ui }).ui
    expect(ui.selected.food).toEqual(['noodles'])
    ui = (applyAskQuestionKey(FORM, ui, ' ') as { ui: typeof ui }).ui
    expect(ui.selected.food).toEqual([])
    ui = (applyAskQuestionKey(FORM, ui, ' ') as { ui: typeof ui }).ui
    const next = applyAskQuestionKey(FORM, ui, '\r')
    expect(next.kind).toBe('update')
    if (next.kind !== 'update') return
    ui = next.ui
    expect(ui.questionIndex).toBe(1)
    expect(ui.selected.food).toEqual(['noodles'])
    ui = (applyAskQuestionKey(FORM, ui, ' ') as { ui: typeof ui }).ui
    ui = (applyAskQuestionKey(FORM, ui, ' ') as { ui: typeof ui }).ui
    expect(ui.selected.drink).toEqual([])
    ui = (applyAskQuestionKey(FORM, ui, ' ') as { ui: typeof ui }).ui
    const submit = applyAskQuestionKey(FORM, ui, '\r')
    expect(submit).toEqual({
      kind: 'submit',
      text: formatAskQuestionAnswers(FORM, ui),
    })
    expect(submit.kind === 'submit' && submit.text).toContain('noodles')
    expect(applyAskQuestionKey(FORM, ui, ESC)).toEqual({ kind: 'dismiss' })
    expect(applyAskQuestionKey(FORM, ui, 'x')).toEqual({ kind: 'ignore' })
    expect(applyAskQuestionKey(FORM, ui, ARROW_UP)).toMatchObject({ kind: 'update' })
    const wrapped = applyAskQuestionKey(FORM, createAskQuestionUi(FORM), ARROW_UP)
    expect(wrapped.kind === 'update' && wrapped.ui.optionIndex).toBe(1)
    expect(projectAskQuestionMirror(FORM, {
      questionIndex: 0,
      optionIndex: 0,
      selected: { food: ['hotpot'] },
    }).below.some(row => row.text.includes('[x] hotpot'))).toBe(true)
    expect(projectAskQuestionMirror(FORM, {
      questionIndex: 1,
      optionIndex: 0,
      selected: { drink: ['tea'] },
    }).below[0]?.text).toBe('AskQuestion dinner')
    expect(projectAskQuestionMirror(FORM, {
      questionIndex: -1,
      optionIndex: 99,
      selected: {},
    }).below.some(row => row.text.includes('what to eat'))).toBe(true)
  })

  it('covers empty-form and untitled projection arms', () => {
    const empty = { title: '', questions: [] as typeof FORM.questions }
    expect(projectAskQuestionMirror(empty, createAskQuestionUi(empty)).below).toEqual([])
    expect(applyAskQuestionKey(empty, createAskQuestionUi(empty), ' ')).toEqual({
      kind: 'dismiss',
    })
    const noOpts = {
      title: '',
      questions: [{ id: 'q', prompt: 'p', allowMultiple: false, options: [] }],
    }
    const painted = projectAskQuestionMirror(noOpts, createAskQuestionUi(noOpts))
    expect(painted.below[0]?.text).toBe('AskQuestion')
    expect(applyAskQuestionKey(noOpts, createAskQuestionUi(noOpts), ' ')).toEqual({
      kind: 'ignore',
    })
    expect(applyAskQuestionKey(noOpts, createAskQuestionUi(noOpts), ARROW_UP)).toMatchObject({
      kind: 'update',
    })
    expect(applyAskQuestionKey(noOpts, createAskQuestionUi(noOpts), ARROW_DOWN)).toMatchObject({
      kind: 'update',
    })
    expect(applyAskQuestionKey(noOpts, createAskQuestionUi(noOpts), '\r')).toMatchObject({
      kind: 'submit',
    })
    expect(formatAskQuestionAnswers(FORM, {
      questionIndex: 0,
      optionIndex: 0,
      selected: { food: ['missing'] },
    })).toContain('missing')
    expect(formatAskQuestionAnswers(
      { title: '', questions: FORM.questions },
      { questionIndex: 0, optionIndex: 0, selected: {} },
    )).toContain('(none)')
  })

  it('Enter confirms the highlighted option when checks are empty', () => {
    const next = applyAskQuestionKey(FORM, createAskQuestionUi(FORM), '\r')
    expect(next.kind).toBe('update')
    if (next.kind !== 'update') return
    expect(next.ui.selected.food).toEqual(['hotpot'])
    expect(next.ui.questionIndex).toBe(1)
    const submit = applyAskQuestionKey(FORM, next.ui, '\r')
    expect(submit.kind).toBe('submit')
    if (submit.kind !== 'submit') return
    expect(submit.text).toContain('hotpot')
    expect(submit.text).toContain('tea')
    const kept = applyAskQuestionKey(FORM, {
      questionIndex: 0,
      optionIndex: 0,
      selected: { food: ['noodles'], drink: [] },
    }, '\r')
    expect(kept.kind === 'update' && kept.ui.selected.food).toEqual(['noodles'])
    const missing = applyAskQuestionKey(FORM, {
      questionIndex: 0,
      optionIndex: 1,
      selected: {},
    }, '\r')
    expect(missing.kind === 'update' && missing.ui.selected.food).toEqual(['noodles'])
  })

  it('reads completed-only payloads and rejects skip-less results', () => {
    expect(readAskQuestionForm({
      type: 'tool_call',
      subtype: 'completed',
      tool_call: {
        function: { name: 'AskQuestion' },
        askQuestionToolCall: {
          args: {
            title: 1,
            questions: [
              { prompt: '   ', options: [{ label: 'a' }] },
              { prompt: 'keep', options: [null, { label: 'a' }, { text: '' }] },
            ],
          },
        },
      },
    })?.questions[0]?.prompt).toBe('keep')
    expect(readAskQuestionForm({
      type: 'tool_call',
      tool_call: {
        otherToolCall: {
          args: { questions: [{ options: [{ name: 'x' }] }] },
        },
      },
    })).toBeUndefined()
    expect(readAskQuestionForm({
      type: 'tool_call',
      tool_call: {
        otherToolCall: {
          args: {
            questions: [null, { prompt: 'x' }, { prompt: 'y', options: [] }],
          },
        },
      },
    })).toBeUndefined()
    expect(isAskQuestionSkipResult({
      type: 'tool_call',
      subtype: 'completed',
      tool_call: { askQuestionToolCall: { result: 'ok' } },
    })).toBe(false)
  })
})

const OTHER_FORM = {
  title: 'afternoon',
  questions: [{
    id: 'q',
    prompt: 'perfect afternoon',
    allowMultiple: false,
    options: [
      { id: 'out', label: 'outdoors' },
      { id: 'in', label: 'indoors' },
      { id: FREEFORM_OPTION_ID, label: 'Other' },
    ],
  }],
}

describe('AskQuestion Other', () => {
  it('strips a trailing catch-all and always appends one Other row', () => {
    const parsed = readAskQuestionForm({
      type: 'tool_call',
      tool_call: {
        askQuestionToolCall: {
          args: {
            questions: [{
              prompt: 'p',
              options: [
                { id: 'out', label: 'outdoors' },
                { id: 'custom', label: 'Other\uFF08custom\uFF09' },
              ],
            }],
          },
        },
      },
    })
    expect(parsed?.questions[0]?.options.map(item => item.id)).toEqual([
      'out',
      FREEFORM_OPTION_ID,
    ])

    const somethingElse = readAskQuestionForm({
      type: 'tool_call',
      tool_call: {
        function: {
          name: 'AskQuestion',
          arguments: {
            questions: [{
              prompt: 'p',
              options: [
                { id: 'a', label: 'alpha' },
                { id: 'b', label: 'something else' },
              ],
            }],
          },
        },
      },
    })
    expect(somethingElse?.questions[0]?.options.map(item => item.label)).toEqual([
      'alpha',
      'Other',
    ])

    const otherwise = readAskQuestionForm({
      type: 'tool_call',
      tool_call: {
        function: {
          name: 'AskQuestion',
          arguments: {
            questions: [{
              prompt: 'p',
              options: [
                { id: 'a', label: 'otherwise' },
                { id: 'b', label: 'other: custom' },
              ],
            }],
          },
        },
      },
    })
    expect(otherwise?.questions[0]?.options.map(item => item.label)).toEqual([
      'otherwise',
      'Other',
    ])

    const chinese = readAskQuestionForm({
      type: 'tool_call',
      tool_call: {
        function: {
          name: 'AskQuestion',
          arguments: {
            questions: [{
              prompt: 'p',
              options: [
                { id: 'a', label: 'outdoors' },
                { id: 'b', label: '\u5176\u4ED6\u81EA\u5B9A\u4E49' },
              ],
            }],
          },
        },
      },
    })
    expect(chinese?.questions[0]?.options.map(item => item.id)).toEqual([
      'a',
      FREEFORM_OPTION_ID,
    ])

    const alreadyFreeform = readAskQuestionForm({
      type: 'tool_call',
      tool_call: {
        function: {
          name: 'AskQuestion',
          arguments: {
            questions: [{
              prompt: 'p',
              options: [
                { id: 'a', label: 'alpha' },
                { id: FREEFORM_OPTION_ID, label: 'Other' },
              ],
            }],
          },
        },
      },
    })
    expect(alreadyFreeform?.questions[0]?.options.map(item => item.id)).toEqual([
      'a',
      FREEFORM_OPTION_ID,
    ])

    const onlyOther = readAskQuestionForm({
      type: 'tool_call',
      tool_call: {
        function: {
          name: 'AskQuestion',
          arguments: {
            questions: [{ prompt: 'p', options: [{ id: 'other', label: 'Other' }] }],
          },
        },
      },
    })
    expect(onlyOther?.questions[0]?.options).toEqual([
      { id: FREEFORM_OPTION_ID, label: 'Other' },
    ])

    const prefixed = readAskQuestionForm({
      type: 'tool_call',
      tool_call: {
        function: {
          name: 'AskQuestion',
          arguments: {
            questions: [{
              prompt: 'p',
              options: [
                { id: 'a', label: 'alpha' },
                { id: 'b', label: 'other - more' },
              ],
            }],
          },
        },
      },
    })
    expect(prefixed?.questions[0]?.options.map(item => item.label)).toEqual(['alpha', 'Other'])

    const elseDash = readAskQuestionForm({
      type: 'tool_call',
      tool_call: {
        function: {
          name: 'AskQuestion',
          arguments: {
            questions: [{
              prompt: 'p',
              options: [
                { id: 'a', label: 'alpha' },
                { id: 'b', label: 'something else - more' },
              ],
            }],
          },
        },
      },
    })
    expect(elseDash?.questions[0]?.options.map(item => item.label)).toEqual(['alpha', 'Other'])

    const elseParen = readAskQuestionForm({
      type: 'tool_call',
      tool_call: {
        function: {
          name: 'AskQuestion',
          arguments: {
            questions: [{
              prompt: 'p',
              options: [
                { id: 'a', label: 'alpha' },
                { id: 'b', label: 'something else (more)' },
              ],
            }],
          },
        },
      },
    })
    expect(elseParen?.questions[0]?.options.map(item => item.label)).toEqual(['alpha', 'Other'])

    const otherParen = readAskQuestionForm({
      type: 'tool_call',
      tool_call: {
        function: {
          name: 'AskQuestion',
          arguments: {
            questions: [{
              prompt: 'p',
              options: [
                { id: 'a', label: 'alpha' },
                { id: 'b', label: 'other (more)' },
              ],
            }],
          },
        },
      },
    })
    expect(otherParen?.questions[0]?.options.map(item => item.label)).toEqual(['alpha', 'Other'])

    const elseColon = readAskQuestionForm({
      type: 'tool_call',
      tool_call: {
        function: {
          name: 'AskQuestion',
          arguments: {
            questions: [{
              prompt: 'p',
              options: [
                { id: 'a', label: 'alpha' },
                { id: 'b', label: 'something else: more' },
              ],
            }],
          },
        },
      },
    })
    expect(elseColon?.questions[0]?.options.map(item => item.label)).toEqual(['alpha', 'Other'])
  })

  it('types into Other, commits typed text or the Other label, and keeps Space as a toggle elsewhere', () => {
    let ui = createAskQuestionUi(OTHER_FORM)
    ui = { ...ui, optionIndex: 2 }
    const painted = projectAskQuestionMirror(OTHER_FORM, ui)
    expect(painted.below.some(row => row.highlighted && row.text.includes('Other'))).toBe(true)
    expect(painted.below.at(-1)?.text).toBe('Type to answer · Enter confirm · Esc to skip')

    expect(applyAskQuestionKey(OTHER_FORM, ui, '\x7f')).toEqual({ kind: 'ignore' })
    ui = (applyAskQuestionKey(OTHER_FORM, ui, 'nap') as { ui: typeof ui }).ui
    expect(ui.freeform?.q).toBe('nap')
    expect(ui.selected.q).toEqual([FREEFORM_OPTION_ID])
    ui = (applyAskQuestionKey(OTHER_FORM, ui, ' ') as { ui: typeof ui }).ui
    expect(ui.freeform?.q).toBe('nap ')
    ui = (applyAskQuestionKey(OTHER_FORM, ui, '\x7f') as { ui: typeof ui }).ui
    expect(ui.freeform?.q).toBe('nap')
    expect(projectAskQuestionMirror(OTHER_FORM, ui).below.some(
      row => row.text.includes('Other: nap'),
    )).toBe(true)

    const submitTyped = applyAskQuestionKey(OTHER_FORM, ui, '\r')
    expect(submitTyped.kind).toBe('submit')
    if (submitTyped.kind !== 'submit') return
    expect(submitTyped.text).toContain('nap')
    expect(submitTyped.text).not.toContain('(none)')

    const empty = applyAskQuestionKey(OTHER_FORM, {
      questionIndex: 0,
      optionIndex: 2,
      selected: {},
    }, '\r')
    expect(empty.kind === 'submit' && empty.text).toContain('Other')

    ui = createAskQuestionUi(OTHER_FORM)
    ui = { ...ui, optionIndex: 2 }
    ui = (applyAskQuestionKey(OTHER_FORM, ui, 'keep') as { ui: typeof ui }).ui
    ui = (applyAskQuestionKey(OTHER_FORM, ui, '\x15') as { ui: typeof ui }).ui
    expect(ui.freeform?.q).toBe('')
    expect(ui.selected.q).toEqual([FREEFORM_OPTION_ID])

    const wrap = applyAskQuestionKey(OTHER_FORM, createAskQuestionUi(OTHER_FORM), ARROW_UP)
    expect(wrap.kind === 'update' && wrap.ui.optionIndex).toBe(2)
    ui = createAskQuestionUi(OTHER_FORM)
    ui = { ...ui, optionIndex: 2 }
    expect(applyAskQuestionKey(OTHER_FORM, ui, '\x1b[3~')).toEqual({ kind: 'ignore' })
    ui = createAskQuestionUi(OTHER_FORM)
    expect(applyAskQuestionKey(OTHER_FORM, ui, 'x')).toEqual({ kind: 'ignore' })
    ui = (applyAskQuestionKey(OTHER_FORM, ui, ' ') as { ui: typeof ui }).ui
    expect(ui.selected.q).toEqual(['out'])
    expect(projectAskQuestionMirror(OTHER_FORM, ui).below.at(-1)?.text).toBe(
      'Space toggle · Enter confirm highlighted · Esc to skip',
    )

    const multi = {
      title: '',
      questions: [{
        id: 'q',
        prompt: 'p',
        allowMultiple: true,
        options: [
          { id: 'a', label: 'a' },
          { id: FREEFORM_OPTION_ID, label: 'Other' },
        ],
      }],
    }
    let multiUi = createAskQuestionUi(multi)
    multiUi = (applyAskQuestionKey(multi, multiUi, ' ') as { ui: typeof multiUi }).ui
    multiUi = { ...multiUi, optionIndex: 1 }
    multiUi = (applyAskQuestionKey(multi, multiUi, 'custom') as { ui: typeof multiUi }).ui
    multiUi = (applyAskQuestionKey(multi, multiUi, '!') as { ui: typeof multiUi }).ui
    expect(multiUi.selected.q).toEqual(['a', FREEFORM_OPTION_ID])
    expect(multiUi.freeform?.q).toBe('custom!')
    const noSelected = applyAskQuestionKey(OTHER_FORM, {
      questionIndex: 0,
      optionIndex: 2,
      selected: {},
    }, 'z')
    expect(noSelected.kind === 'update' && noSelected.ui.selected.q).toEqual([
      FREEFORM_OPTION_ID,
    ])
    const multiSubmit = applyAskQuestionKey(multi, multiUi, '\r')
    expect(multiSubmit.kind === 'submit' && multiSubmit.text).toContain('a')
    expect(multiSubmit.kind === 'submit' && multiSubmit.text).toContain('custom')
  })
})
