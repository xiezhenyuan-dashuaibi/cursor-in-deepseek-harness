// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { Page, PREFERRED_FRAME, type PageProps } from '../src/client/Page.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
})

const t = makeTranslate(zh)

function renderPage() {
  const preferFrame = vi.fn()
  const view = render(
    <Page
      t={t as PageProps['t']}
      preferFrame={preferFrame}
    />,
  )
  return { ...view, preferFrame }
}

describe('Page', () => {
  it('asks for the opening frame and shows the title', () => {
    const { preferFrame, getByRole } = renderPage()
    expect(preferFrame).toHaveBeenCalledWith(PREFERRED_FRAME)
    expect(getByRole('heading', { level: 1 }).textContent).toBe(zh.title)
  })

  it('marks the stamp pressed after click', () => {
    const { getByRole } = renderPage()
    fireEvent.click(getByRole('button', { name: zh.action }))
    expect(getByRole('button', { name: zh.actionDone }).getAttribute('aria-pressed')).toBe('true')
  })
})
