// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { Page, pipelineLit, PREFERRED_FRAME, type PageProps } from '../src/client/Page.tsx'
import { zh } from '../src/client/locales.ts'
import { EMPTY_PETSHOP_HUB_SIGNALS } from '../src/client/poll.ts'
import type { PetshopHubSignals } from '../src/wire.ts'

afterEach(() => {
  cleanup()
})

const t = makeTranslate(zh)

function renderPage(snapshot: PetshopHubSignals) {
  const preferFrame = vi.fn()
  const useSignals = ((sel: (s: PetshopHubSignals) => unknown) => sel(snapshot)) as PageProps['useSignals']
  const view = render(
    <Page
      t={t as PageProps['t']}
      preferFrame={preferFrame}
      useSignals={useSignals}
    />,
  )
  return { ...view, preferFrame }
}

describe('pipelineLit', () => {
  it('lights hops through the latest happy-path stage', () => {
    expect(pipelineLit('home-in', null)).toBe(false)
    expect(pipelineLit('home-in', 'failed')).toBe(false)
    expect(pipelineLit('store-ok', 'store-out')).toBe(false)
    expect(pipelineLit('store-out', 'store-ok')).toBe(true)
    expect(pipelineLit('home-ack', 'home-ack')).toBe(true)
  })
})

describe('Page', () => {
  it('asks for the opening frame and shows the idle console', () => {
    const { preferFrame, getByRole, getByLabelText } = renderPage(EMPTY_PETSHOP_HUB_SIGNALS)
    expect(preferFrame).toHaveBeenCalledWith(PREFERRED_FRAME)
    expect(getByRole('heading', { level: 1 }).textContent).toBe(zh.headline)
    expect(getByLabelText(zh.brand).getAttribute('data-stage')).toBe('idle')
    expect(getByRole('status').textContent).toBe(zh.idle)
  })

  it('lights the pipeline after a successful hop chain', () => {
    const snapshot: PetshopHubSignals = {
      lastStage: 'home-ack',
      lastError: null,
      signals: [
        { id: '4', at: '2026-09-06T10:00:03.000Z', stage: 'home-ack', detail: 'row' },
        { id: '3', at: '2026-09-06T10:00:02.000Z', stage: 'store-ok', detail: 'row' },
        { id: '2', at: '2026-09-06T10:00:01.000Z', stage: 'store-out', detail: 'cut' },
        { id: '1', at: '2026-09-06T10:00:00.000Z', stage: 'home-in', detail: '林小姐' },
      ],
    }
    const { getByLabelText, getByText, getByRole } = renderPage(snapshot)
    expect(getByRole('status').textContent).toBe(zh.listening)
    expect(getByLabelText(zh.brand).getAttribute('data-failed')).toBe('false')
    expect(getByText(zh['node.home-ack']).getAttribute('data-lit')).toBe('true')
    expect(getByText(zh['stage.home-in'])).toBeTruthy()
  })

  it('shows the last failure detail', () => {
    const snapshot: PetshopHubSignals = {
      lastStage: 'failed',
      lastError: 'sqlite locked',
      signals: [{ id: '1', at: '2026-09-06T10:00:00.000Z', stage: 'failed', detail: 'sqlite locked' }],
    }
    const { getByRole, getAllByText, getByLabelText } = renderPage(snapshot)
    expect(getByRole('status').textContent).toBe(zh.failed)
    expect(getAllByText('sqlite locked').length).toBeGreaterThan(0)
    expect(getByLabelText(zh.brand).getAttribute('data-failed')).toBe('true')
  })

  it('omits the error line when a failure has no detail', () => {
    const snapshot: PetshopHubSignals = {
      lastStage: 'failed',
      lastError: null,
      signals: [],
    }
    const { queryByText, getByRole } = renderPage(snapshot)
    expect(getByRole('status').textContent).toBe(zh.failed)
    expect(queryByText('sqlite locked')).toBeNull()
  })
})
