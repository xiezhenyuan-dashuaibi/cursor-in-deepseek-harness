// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { FlowerPot, type FlowerPotProps } from '../src/client/FlowerPot.tsx'
import { zh } from '../src/client/locales.ts'
import { STORAGE_KEY, serializePlant } from '../src/client/plant.ts'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.localStorage.clear()
})

beforeEach(() => {
  window.localStorage.clear()
})

const t = makeTranslate(zh)

function renderPot() {
  return render(<FlowerPot t={t as FlowerPotProps['t']} />)
}

describe('FlowerPot', () => {
  it('shows a planted seed and waters the soil', () => {
    const view = renderPot()
    expect(view.getByText(`${zh.soil} · ${zh.growing}`)).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: zh.water }))
    expect(view.getByRole('img', { name: `${zh.label}，${zh.soil}，${zh.growing}` })).toBeTruthy()
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"moisture"')
  })

  it('feeds the soil from the fertilize control', () => {
    const view = renderPot()
    fireEvent.click(view.getByRole('button', { name: zh.fertilize }))
    const raw = window.localStorage.getItem(STORAGE_KEY)
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw as string).nutrients).toBeGreaterThan(0.2)
  })

  it('paints a stored bloom', () => {
    window.localStorage.setItem(STORAGE_KEY, serializePlant({
      moisture: 0.5, nutrients: 0.4, growth: 0.9, updatedAt: Date.now(),
    }))
    const view = renderPot()
    expect(view.getByText(`${zh.bloom} · ${zh.growing}`)).toBeTruthy()
  })

  it('says the leaves are wilting when stored moisture is gone', () => {
    vi.useFakeTimers()
    vi.setSystemTime(2_000_000)
    window.localStorage.setItem(STORAGE_KEY, serializePlant({
      moisture: 0.05, nutrients: 0.2, growth: 0.3, updatedAt: 2_000_000,
    }))
    const view = renderPot()
    expect(view.getByText(`${zh.seedling} · ${zh.wilted}`)).toBeTruthy()
  })
})
