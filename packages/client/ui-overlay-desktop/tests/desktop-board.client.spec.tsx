// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { DesktopBoard, type DesktopBoardProps } from '../src/client/DesktopBoard.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
})

const t = makeTranslate(zh)

describe('DesktopBoard', () => {
  it('hosts overlay-desktop.body and renders the empty fallback', () => {
    const renderSlot = vi.fn((_name: string, _owner: unknown, opts?: { fallback?: unknown }) => (
      opts?.fallback ?? null
    ))
    const view = render(
      <DesktopBoard
        t={t as DesktopBoardProps['t']}
        renderSlot={renderSlot as DesktopBoardProps['renderSlot']}
      />,
    )
    expect(view.container.querySelector('[data-overlay-desktop]')).toBeTruthy()
    expect(view.container.querySelector('[data-overlay-board]')).toBeTruthy()
    expect(view.getByText('空桌面')).toBeTruthy()
    expect(view.container.querySelector('[data-overlay-desktop-empty]')).toBeTruthy()
    expect(renderSlot).toHaveBeenCalledWith(
      'overlay-desktop.body',
      {},
      expect.objectContaining({ fallback: expect.anything() }),
    )
  })
})
