// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  consumeCardHashClick, resolveCardHashTarget, scrollNearestWithin,
} from '../src/client/hash.ts'

describe('resolveCardHashTarget', () => {
  it('finds an id only under the given body when the document already has that id', () => {
    const other = document.createElement('div')
    other.innerHTML = '<section id="book">other</section>'
    const root = document.createElement('div')
    root.innerHTML = '<section id="book">here</section>'
    document.body.append(other, root)
    expect(resolveCardHashTarget(root, '#book')?.textContent).toBe('here')
    expect(resolveCardHashTarget(root, '#missing')).toBeUndefined()
    expect(resolveCardHashTarget(root, '/path')).toBeUndefined()
    expect(document.getElementById('book')?.textContent).toBe('other')
    root.remove()
    other.remove()
  })
})

describe('scrollNearestWithin', () => {
  it('adjusts only the container scroll offsets', () => {
    const container = document.createElement('div')
    const target = document.createElement('section')
    const sibling = document.createElement('div')
    container.scrollTop = 10
    sibling.scrollTop = 40
    container.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 200, height: 100, top: 0, left: 0, right: 200, bottom: 100, toJSON() {},
    })
    target.getBoundingClientRect = () => ({
      x: 0, y: 180, width: 200, height: 40, top: 180, left: 0, right: 200, bottom: 220, toJSON() {},
    })
    scrollNearestWithin(container, target)
    expect(container.scrollTop).toBe(130)
    expect(sibling.scrollTop).toBe(40)
  })
})

describe('consumeCardHashClick', () => {
  it('scrolls the in-body target and does not use another root or scrollIntoView', () => {
    const body = document.createElement('div')
    body.innerHTML = '<a href="#book">go</a><section id="book">here</section>'
    const decoy = document.createElement('div')
    decoy.innerHTML = '<section id="book">other</section>'
    document.body.append(decoy, body)
    const here = [...body.querySelectorAll('[id]')].find(el => el.id === 'book') as HTMLElement
    const other = [...decoy.querySelectorAll('[id]')].find(el => el.id === 'book') as HTMLElement
    here.scrollIntoView = vi.fn()
    other.scrollIntoView = vi.fn()
    body.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 200, height: 80, top: 0, left: 0, right: 200, bottom: 80, toJSON() {},
    })
    here.getBoundingClientRect = () => ({
      x: 0, y: 120, width: 200, height: 40, top: 120, left: 0, right: 200, bottom: 160, toJSON() {},
    })
    const anchor = body.querySelector('a') as HTMLAnchorElement
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'target', { value: anchor })
    expect(consumeCardHashClick(event, body)).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    expect(body.scrollTop).toBe(80)
    expect(decoy.scrollTop).toBe(0)
    expect(here.scrollIntoView).not.toHaveBeenCalled()
    expect(other.scrollIntoView).not.toHaveBeenCalled()
    body.remove()
    decoy.remove()
  })

  it('scrolls a nested overflow root inside the body, not the body wrapper', () => {
    const body = document.createElement('div')
    const inner = document.createElement('div')
    inner.style.overflowY = 'auto'
    Object.defineProperty(inner, 'scrollHeight', { configurable: true, get: () => 400 })
    Object.defineProperty(inner, 'clientHeight', { configurable: true, get: () => 80 })
    const spacer = document.createElement('div')
    const book = document.createElement('section')
    book.id = 'book'
    book.textContent = 'here'
    inner.append(spacer, book)
    const anchor = document.createElement('a')
    anchor.setAttribute('href', '#book')
    anchor.textContent = 'go'
    body.append(anchor, inner)
    document.body.append(body)
    inner.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 200, height: 80, top: 0, left: 0, right: 200, bottom: 80, toJSON() {},
    })
    book.getBoundingClientRect = () => ({
      x: 0, y: 200, width: 200, height: 40, top: 200, left: 0, right: 200, bottom: 240, toJSON() {},
    })
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'target', { value: anchor })
    expect(consumeCardHashClick(event, body)).toBe(true)
    expect(body.scrollTop).toBe(0)
    body.remove()
  })

  it('cancels a missing local hash so the document does not jump', () => {
    const body = document.createElement('div')
    body.innerHTML = '<a href="#absent">go</a>'
    document.body.append(body)
    const anchor = body.querySelector('a') as HTMLAnchorElement
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'target', { value: anchor })
    expect(consumeCardHashClick(event, body)).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    body.remove()
  })
})
