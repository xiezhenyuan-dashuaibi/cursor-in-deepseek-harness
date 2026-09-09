// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { Page, PREFERRED_FRAME, type PageProps } from '../src/client/Page.tsx'
import { zh } from '../src/client/locales.ts'
import type { PetshopHomeBookOutcome } from '../src/client/booking.ts'

afterEach(() => {
  cleanup()
})

const t = makeTranslate(zh)

function renderPage(book: PageProps['book'] = vi.fn()) {
  const preferFrame = vi.fn()
  const view = render(
    <Page
      t={t as PageProps['t']}
      preferFrame={preferFrame}
      book={book}
    />,
  )
  return { ...view, preferFrame, book }
}

function fillValidForm(
  getByLabelText: ReturnType<typeof renderPage>['getByLabelText'],
  getByRole: ReturnType<typeof renderPage>['getByRole'],
) {
  fireEvent.click(getByRole('button', { name: new RegExp(`^${zh['pkg.cut.name']}`) }))
  fireEvent.click(getByRole('button', { name: '14:00' }))
  fireEvent.change(getByLabelText(zh['form.dog']), { target: { value: '豆豆' } })
  fireEvent.change(getByLabelText(zh['form.breed']), { target: { value: '柯基' } })
  fireEvent.change(getByLabelText(zh['form.owner']), { target: { value: '林小姐' } })
  fireEvent.change(getByLabelText(zh['form.phone']), { target: { value: '13800138000' } })
}

describe('Page', () => {
  it('asks for the opening frame and shows the shop headline', () => {
    const { preferFrame, getByRole, getByLabelText } = renderPage()
    expect(preferFrame).toHaveBeenCalledWith(PREFERRED_FRAME)
    expect(getByRole('heading', { level: 1 }).textContent).toBe(zh.headline)
    expect(getByLabelText(zh.brand).getAttribute('data-package')).toBe('')
    expect(getByLabelText(zh.brand).getAttribute('data-slot')).toBe('')
  })

  it('selects a different package and slot', () => {
    const { getByLabelText, getByRole } = renderPage()
    fireEvent.click(getByRole('button', { name: new RegExp(`^${zh['pkg.full.name']}`) }))
    fireEvent.click(getByRole('button', { name: '19:00' }))
    expect(getByLabelText(zh.brand).getAttribute('data-package')).toBe('full')
    expect(getByLabelText(zh.brand).getAttribute('data-slot')).toBe('19:00')
  })

  it('rejects an incomplete booking', () => {
    const { getByRole, queryByText, book } = renderPage()
    fireEvent.click(getByRole('button', { name: zh['form.submit'] }))
    expect(queryByText(zh['form.error.required'])).toBeTruthy()
    expect(book).not.toHaveBeenCalled()
  })

  it('rejects a non-mobile phone', () => {
    const { getByLabelText, getByRole, queryByText } = renderPage()
    fillValidForm(getByLabelText, getByRole)
    fireEvent.change(getByLabelText(zh['form.phone']), { target: { value: '12345' } })
    fireEvent.click(getByRole('button', { name: zh['form.submit'] }))
    expect(queryByText(zh['form.error.phone'])).toBeTruthy()
  })

  it('shows 预约成功 after the hub ack', async () => {
    const book = vi.fn(async (): Promise<PetshopHomeBookOutcome> => ({
      ok: true,
      ack: { id: 'abcdef12-row', createdAt: 't' },
    }))
    const { getByLabelText, getByRole } = renderPage(book)
    fillValidForm(getByLabelText, getByRole)
    fireEvent.click(getByRole('button', { name: zh['form.submit'] }))
    await waitFor(() => {
      expect(getByLabelText(zh.brand).getAttribute('data-booked')).toBe('true')
    })
    expect(getByRole('status').textContent).toContain('豆豆')
    expect(getByRole('status').textContent).toContain(zh['booked.title'])
    fireEvent.click(getByRole('button', { name: zh['booked.reset'] }))
    expect(getByLabelText(zh.brand).getAttribute('data-booked')).toBe('false')
  })

  it('shows the rpc error when the hub refuses', async () => {
    const book = vi.fn(async (): Promise<PetshopHomeBookOutcome> => ({
      ok: false,
      message: 'nope',
    }))
    const { getByLabelText, getByRole, queryByText } = renderPage(book)
    fillValidForm(getByLabelText, getByRole)
    fireEvent.click(getByRole('button', { name: zh['form.submit'] }))
    await waitFor(() => {
      expect(queryByText(zh['form.error.rpc'])).toBeTruthy()
    })
  })

  it('disables submit while the hub call is in flight', async () => {
    let finish!: (value: PetshopHomeBookOutcome) => void
    const book = vi.fn(() => new Promise<PetshopHomeBookOutcome>((resolve) => {
      finish = resolve
    }))
    const { getByLabelText, getByRole } = renderPage(book)
    fillValidForm(getByLabelText, getByRole)
    fireEvent.click(getByRole('button', { name: zh['form.submit'] }))
    expect(getByRole('button', { name: zh['form.sending'] })).toHaveProperty('disabled', true)
    finish({ ok: true, ack: { id: 'z', createdAt: 't' } })
    await waitFor(() => {
      expect(getByLabelText(zh.brand).getAttribute('data-booked')).toBe('true')
    })
  })
})
