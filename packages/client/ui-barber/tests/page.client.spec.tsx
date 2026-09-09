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
  it('asks for the opening frame and shows the shop headline', () => {
    const { preferFrame, getByLabelText, getByRole } = renderPage()
    expect(preferFrame).toHaveBeenCalledWith(PREFERRED_FRAME)
    expect(getByLabelText(zh.brand).getAttribute('data-mood')).toBe('day')
    expect(getByRole('heading', { level: 1 }).textContent).toBe(zh.headline)
  })

  it('selects a service and barber from the catalog', () => {
    const { getByLabelText, getAllByRole } = renderPage()
    fireEvent.click(getAllByRole('button', { name: new RegExp(`^${zh['service.style.name']}`) })[0]!)
    fireEvent.click(getAllByRole('button', { name: new RegExp(`^${zh['barber.kai.name']}`) })[0]!)
    const page = getByLabelText(zh.brand)
    expect(page.getAttribute('data-service')).toBe('style')
    expect(page.getAttribute('data-barber')).toBe('kai')
  })

  it('rejects an incomplete booking then locks a valid hold', () => {
    const { getByLabelText, getByRole, getAllByRole, queryByText } = renderPage()
    fireEvent.click(getByRole('button', { name: zh['form.submit'] }))
    expect(queryByText(zh['form.error.required'])).toBeTruthy()
    fireEvent.change(getByLabelText(zh['form.name']), { target: { value: '陈先生' } })
    fireEvent.change(getByLabelText(zh['form.phone']), { target: { value: '13800138000' } })
    fireEvent.click(getAllByRole('button', { name: zh['service.cut.name'] })[0]!)
    fireEvent.click(getAllByRole('button', { name: zh['barber.zhou.name'] })[0]!)
    fireEvent.click(getByRole('button', { name: '14:00' }))
    fireEvent.click(getByRole('button', { name: zh['form.submit'] }))
    expect(getByLabelText(zh.brand).getAttribute('data-booked')).toBe('true')
    expect(getByRole('status').textContent).toContain('陈先生')
    expect(getByRole('status').textContent).toContain('14:00')
    fireEvent.click(getByRole('button', { name: zh['booked.reset'] }))
    expect(getByLabelText(zh.brand).getAttribute('data-booked')).toBe('false')
  })

  it('rejects a non-mobile phone and switches shop lights', () => {
    const { getByLabelText, getByRole, getAllByRole, queryByText } = renderPage()
    fireEvent.change(getByLabelText(zh['form.name']), { target: { value: '林小姐' } })
    fireEvent.change(getByLabelText(zh['form.phone']), { target: { value: '12345' } })
    fireEvent.click(getAllByRole('button', { name: zh['service.shave.name'] })[0]!)
    fireEvent.click(getAllByRole('button', { name: zh['barber.lin.name'] })[0]!)
    fireEvent.click(getByRole('button', { name: '19:00' }))
    fireEvent.click(getByRole('button', { name: zh['form.submit'] }))
    expect(queryByText(zh['form.error.phone'])).toBeTruthy()
    fireEvent.click(getByRole('button', { name: zh['mood.night'] }))
    expect(getByLabelText(zh.brand).getAttribute('data-mood')).toBe('night')
    expect(getByRole('button', { name: zh['mood.night'] }).getAttribute('aria-pressed')).toBe('true')
  })

  it('expands a different FAQ row', () => {
    const { getByRole, queryByText } = renderPage()
    expect(queryByText(zh['faq.book.a'])).toBeTruthy()
    fireEvent.click(getByRole('button', { name: zh['faq.price.q'] }))
    expect(queryByText(zh['faq.price.a'])).toBeTruthy()
    expect(queryByText(zh['faq.book.a'])).toBeNull()
  })
})
