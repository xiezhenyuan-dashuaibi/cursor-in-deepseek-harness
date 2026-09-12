// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { Page, type PageProps } from '../src/client/Page.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 11, 21, 7, 0))
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
  it('shows the horizon title and evening coordinate clock', () => {
    const { getByRole } = renderPage()
    expect(getByRole('heading', { level: 1 }).textContent).toBe(zh.title)
    expect(getByRole('main', { name: zh.title }).querySelector('time')?.textContent).toBe('21:07:00')
  })

  it('advances the coordinate clock on the interval', () => {
    const { getByRole } = renderPage()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(getByRole('main', { name: zh.title }).querySelector('time')?.textContent).toBe('21:07:01')
  })

  it('counts swallowed photons and announces the crossing', () => {
    const { getByRole, getByText, queryByText } = renderPage()
    expect(queryByText(zh.notice)).toBeNull()
    expect(getByText(t('stats', { count: 0 }))).toBeTruthy()
    fireEvent.click(getByRole('button', { name: zh.ingest }))
    expect(getByText(t('stats', { count: 1 }))).toBeTruthy()
    expect(getByText(zh.notice)).toBeTruthy()
    fireEvent.click(getByRole('button', { name: zh.ingest }))
    expect(getByText(t('stats', { count: 2 }))).toBeTruthy()
  })
})
