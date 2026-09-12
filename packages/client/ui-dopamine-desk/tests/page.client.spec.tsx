// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { Page, type PageProps } from '../src/client/Page.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
})

const t = makeTranslate(zh)

function renderPage() {
  return render(
    <Page
      t={t as PageProps['t']}
    />,
  )
}

describe('Page', () => {
  it('shows the title', () => {
    const { getByRole } = renderPage()
    expect(getByRole('heading', { level: 1 }).textContent).toBe(zh.title)
  })

  it('adds burst points after a candy click', () => {
    const { getByRole, getByText } = renderPage()
    fireEvent.click(getByRole('button', { name: zh.hitC }))
    expect(getByText('8')).toBeTruthy()
  })
})
