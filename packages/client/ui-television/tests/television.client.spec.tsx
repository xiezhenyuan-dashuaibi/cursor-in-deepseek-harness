// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { OPENING_SRC, Television, type TelevisionProps } from '../src/client/Television.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
})

const t = makeTranslate(zh)

function renderSet() {
  return render(
    <Television t={t as TelevisionProps['t']} />,
  )
}

describe('Television', () => {
  it('opens the CRT on the opening webpage', () => {
    const { getByTitle, getByLabelText } = renderSet()
    expect(getByLabelText(zh['set.label']).getAttribute('data-overlay-television')).toBe('')
    expect((getByTitle(zh.screen) as HTMLIFrameElement).src).toBe(OPENING_SRC)
  })

  it('retunes the CRT to an http(s) channel', () => {
    const { getByLabelText, getByRole, getByTitle } = renderSet()
    fireEvent.change(getByLabelText(zh['channel.label']), {
      target: { value: 'example.org' },
    })
    fireEvent.click(getByRole('button', { name: zh['channel.go'] }))
    expect((getByTitle(zh.screen) as HTMLIFrameElement).src).toBe('https://example.org/')
  })

  it('keeps the current page when the channel text is not a web address', () => {
    const { getByLabelText, getByRole, getByTitle, queryByRole } = renderSet()
    fireEvent.change(getByLabelText(zh['channel.label']), {
      target: { value: 'javascript:alert(1)' },
    })
    fireEvent.click(getByRole('button', { name: zh['channel.go'] }))
    expect((getByTitle(zh.screen) as HTMLIFrameElement).src).toBe(OPENING_SRC)
    expect(getByRole('alert').textContent).toBe(zh['channel.invalid'])
    fireEvent.change(getByLabelText(zh['channel.label']), {
      target: { value: 'example.net' },
    })
    expect(queryByRole('alert')).toBeNull()
  })
})
