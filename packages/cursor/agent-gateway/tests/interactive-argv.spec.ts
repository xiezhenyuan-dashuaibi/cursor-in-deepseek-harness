import { describe, expect, it } from 'vitest'
import { buildInteractiveArgs } from '../src/interactive-argv.ts'

describe('buildInteractiveArgs', () => {
  it('strips headless print flags and keeps trust/mcp args', () => {
    expect(buildInteractiveArgs([
      'index.js',
      '--approve-mcps',
      '--trust',
      '--print',
      '--output-format',
      'stream-json',
      '--stream-partial-output',
      '--force',
    ])).toEqual(['index.js', '--approve-mcps', '--trust'])
  })

  it('keeps sandbox value pairs', () => {
    expect(buildInteractiveArgs(['--sandbox', 'enabled', '-p'])).toEqual([
      '--sandbox',
      'enabled',
    ])
  })

  it('strips model/mode/resume equals forms and bare sandbox', () => {
    expect(buildInteractiveArgs([
      '--model=auto',
      '--mode=ask',
      '--resume=abc',
      '--sandbox',
      '--yolo',
      'keep',
    ])).toEqual(['--sandbox', 'keep'])
  })
})
