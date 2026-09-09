// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { Page, PREFERRED_FRAME, type PageProps } from '../src/client/Page.tsx'
import { zh } from '../src/client/locales.ts'
import type { PetshopBookingRow, PetshopStoreList } from '../src/wire.ts'

afterEach(() => {
  cleanup()
})

const t = makeTranslate(zh)

const row: PetshopBookingRow = {
  id: 'abcdef12-xxxx',
  createdAt: '2026-09-06T10:15:00.000Z',
  dogName: '豆豆',
  breed: '柯基',
  owner: '林小姐',
  phone: '13800138000',
  packageId: 'cut',
  slot: '14:00',
}

function renderPage(list: PetshopStoreList) {
  const preferFrame = vi.fn()
  const useLedger = ((sel: (s: PetshopStoreList) => unknown) => sel(list)) as PageProps['useLedger']
  const view = render(
    <Page
      t={t as PageProps['t']}
      preferFrame={preferFrame}
      useLedger={useLedger}
    />,
  )
  return { ...view, preferFrame }
}

describe('Page', () => {
  it('asks for the opening frame and shows the empty ledger', () => {
    const { preferFrame, getByRole, getByLabelText } = renderPage({ rows: [] })
    expect(preferFrame).toHaveBeenCalledWith(PREFERRED_FRAME)
    expect(getByRole('heading', { level: 1 }).textContent).toBe(zh.headline)
    expect(getByLabelText(zh.brand).getAttribute('data-count')).toBe('0')
    expect(getByRole('status').textContent).toBe(zh.empty)
  })

  it('renders a stored booking row', () => {
    const { getByLabelText, getByText } = renderPage({ rows: [row] })
    expect(getByLabelText(zh.brand).getAttribute('data-count')).toBe('1')
    expect(getByText('豆豆')).toBeTruthy()
    expect(getByText(zh['pkg.cut'])).toBeTruthy()
    expect(getByText('abcdef12')).toBeTruthy()
  })
})
