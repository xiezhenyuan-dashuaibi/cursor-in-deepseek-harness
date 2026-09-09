// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SkipOnboarding } from '../src/client/SkipOnboarding.tsx'

describe('SkipOnboarding', () => {
  it('paints nothing', () => {
    const view = render(<SkipOnboarding />)
    expect(view.container.childElementCount).toBe(0)
  })
})
