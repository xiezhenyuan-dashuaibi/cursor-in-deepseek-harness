import { describe, expect, it } from 'vitest'
import {
  buildHeadlessTurnArgs,
  filterConfiguredAgentArgs,
  HEADLESS_PRINT_FLAGS,
} from '../src/headless-argv.ts'

describe('filterConfiguredAgentArgs', () => {
  it('keeps MCP trust flags and drops owned print/resume flags', () => {
    expect(filterConfiguredAgentArgs([
      '--approve-mcps',
      '--trust',
      '--print',
      '--output-format',
      'text',
      '--stream-partial-output',
      '--force',
      '--resume',
      'old-id',
      '-p',
      '-f',
    ])).toEqual(['--approve-mcps', '--trust'])
  })
})

describe('buildHeadlessTurnArgs', () => {
  it('injects print flags, optional resume, and the prompt after --', () => {
    expect(buildHeadlessTurnArgs(
      ['index.js', '--approve-mcps', '--trust'],
      { prompt: 'hello world' },
    )).toEqual([
      'index.js',
      '--approve-mcps',
      '--trust',
      ...HEADLESS_PRINT_FLAGS,
      '--',
      'hello world',
    ])
    expect(buildHeadlessTurnArgs(
      ['--approve-mcps'],
      { resumeSessionId: 'sess-1', prompt: 'next' },
    )).toEqual([
      '--approve-mcps',
      ...HEADLESS_PRINT_FLAGS,
      '--resume',
      'sess-1',
      '--',
      'next',
    ])
  })
})
