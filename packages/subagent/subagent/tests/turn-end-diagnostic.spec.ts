import { describe, expect, it } from 'vitest'
import { diagnosticFromTurnEnd } from '../src/index.ts'

describe('diagnosticFromTurnEnd', () => {
  it('copies a non-empty turn/end error message', () => {
    expect(diagnosticFromTurnEnd({
      kind: 'error',
      error: { message: 'no API key for provider route "deepseek-official"', code: 'MISSING_CREDENTIAL' },
    })).toBe('no API key for provider route "deepseek-official"')
  })

  it('omits an empty error message and every non-error reason', () => {
    expect(diagnosticFromTurnEnd({ kind: 'error', error: { message: '', code: 'UNKNOWN' } })).toBeUndefined()
    expect(diagnosticFromTurnEnd({ kind: 'completed' })).toBeUndefined()
    expect(diagnosticFromTurnEnd({ kind: 'aborted', reason: { kind: 'user' } })).toBeUndefined()
    expect(diagnosticFromTurnEnd(undefined)).toBeUndefined()
  })
})
