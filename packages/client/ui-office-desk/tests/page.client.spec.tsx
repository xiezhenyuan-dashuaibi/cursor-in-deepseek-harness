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
  vi.setSystemTime(new Date(2026, 8, 10, 9, 30, 0))
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
  it('shows the workstation title, Thursday date, and morning clock', () => {
    const { getByRole } = renderPage()
    expect(getByRole('heading', { level: 1 }).textContent).toBe(zh.title)
    expect(getByRole('main', { name: zh.title }).querySelector('time')?.textContent).toBe('09:30')
    expect(getByRole('main', { name: zh.title }).textContent).toContain(zh['weekday.thu'])
    expect(getByRole('main', { name: zh.title }).textContent).toContain('9月10日')
  })

  it('advances the clock on the interval', () => {
    const { getByRole } = renderPage()
    act(() => {
      vi.setSystemTime(new Date(2026, 8, 10, 9, 31, 0))
      vi.advanceTimersByTime(1000)
    })
    expect(getByRole('main', { name: zh.title }).querySelector('time')?.textContent).toBe('09:31')
  })

  it('checks a task and restores it when clicked again', () => {
    const { getByRole, queryByText } = renderPage()
    const review = getByRole('checkbox', { name: zh['task.review'] }) as HTMLInputElement
    fireEvent.click(review)
    expect(review.checked).toBe(true)
    expect(queryByText(zh['tasks.clear'])).toBeNull()
    fireEvent.click(review)
    expect(review.checked).toBe(false)
  })

  it('announces a clear list after every task is checked', () => {
    const { getByRole, getByText } = renderPage()
    fireEvent.click(getByRole('checkbox', { name: zh['task.review'] }))
    fireEvent.click(getByRole('checkbox', { name: zh['task.report'] }))
    fireEvent.click(getByRole('checkbox', { name: zh['task.inbox'] }))
    expect(getByText(zh['tasks.clear'])).toBeTruthy()
  })

  it('toggles focus and shows the do-not-disturb hint', () => {
    const { getByRole, queryByText } = renderPage()
    const main = getByRole('main', { name: zh.title })
    expect(main.getAttribute('data-focus')).toBe('off')
    fireEvent.click(getByRole('button', { name: zh['focus.start'] }))
    expect(getByRole('button', { name: zh['focus.stop'] }).getAttribute('aria-pressed')).toBe('true')
    expect(main.getAttribute('data-focus')).toBe('on')
    expect(queryByText(zh['focus.hint'])).not.toBeNull()
    fireEvent.click(getByRole('button', { name: zh['focus.stop'] }))
    expect(getByRole('button', { name: zh['focus.start'] }).getAttribute('aria-pressed')).toBe('false')
  })

  it('switches window light from daylight to evening', () => {
    const { getByRole } = renderPage()
    const main = getByRole('main', { name: zh.title })
    expect(main.getAttribute('data-mood')).toBe('day')
    fireEvent.click(getByRole('radio', { name: zh['mood.night'] }))
    expect(main.getAttribute('data-mood')).toBe('night')
    fireEvent.click(getByRole('radio', { name: zh['mood.day'] }))
    expect(main.getAttribute('data-mood')).toBe('day')
  })
})
