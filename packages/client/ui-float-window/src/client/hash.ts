/**
 * Same-document hash navigation scoped to one overlay card body.
 * `document.getElementById` and CSS `#id` are document-global: with two
 * `id="book"` trees they return the first in the document, or miss the
 * in-card match when that first node sits in another window.
 * `Element.scrollIntoView` also scrolls overlay ancestors and would move
 * other cards on screen; in-card hash only adjusts a scrollport inside that body.
 */

/**
 * Match `id` among this body's descendants. Do not use a `#id` selector:
 * that path is document-global when ids are duplicated across cards.
 * @param body - that card's body root.
 * @param id - decoded hash id.
 * @returns the first descendant (or the body) whose `id` property equals `id`.
 */
function findDescendantById(body: ParentNode, id: string): Element | undefined {
  if (body instanceof Element && body.id === id) return body
  for (const el of body.querySelectorAll('[id]')) {
    if (el.id === id) return el
  }
  return undefined
}

/**
 * Find the in-body target of a same-document hash href.
 * @param body - that card's body root.
 * @param href - `a[href]` value; only `#…` is considered.
 * @returns the element, or undefined when the href is not a local hash or the id is absent in this body.
 */
export function resolveCardHashTarget(body: ParentNode, href: string): Element | undefined {
  if (!href.startsWith('#') || href.length < 2) return undefined
  let id: string
  try {
    id = decodeURIComponent(href.slice(1))
  } catch {
    // URIError from malformed percent-encoding; treat as no local hash.
    return undefined
  }
  if (id.length === 0) return undefined
  return findDescendantById(body, id)
}

/** True when `el` has a used overflow axis that can change scroll offsets. */
function canScroll(el: HTMLElement): boolean {
  const style = getComputedStyle(el)
  const y = style.overflowY
  const x = style.overflowX
  return ((y === 'auto' || y === 'scroll') && el.scrollHeight > el.clientHeight + 1)
    || ((x === 'auto' || x === 'scroll') && el.scrollWidth > el.clientWidth + 1)
}

/**
 * Nearest overflow ancestor of `target` that still sits inside the card body.
 * Page occupants often scroll on their own root (`overflow: auto`); the body
 * wrapper may not.
 * @param body - that card's body root.
 * @param target - the in-body hash target.
 * @returns the element whose scroll offsets should move.
 */
function nearestScrollport(body: HTMLElement, target: HTMLElement): HTMLElement {
  let current: HTMLElement | null = target.parentElement
  while (current !== null && body.contains(current)) {
    if (canScroll(current)) return current
    if (current === body) break
    current = current.parentElement
  }
  return body
}

/**
 * Bring `target` into `container` using only that container's scroll offsets.
 * Does not call `scrollIntoView`, which would scroll overlay ancestors.
 * @param container - a scrollport inside the card body.
 * @param target - the in-body hash target.
 */
export function scrollNearestWithin(container: HTMLElement, target: HTMLElement): void {
  const c = container.getBoundingClientRect()
  const t = target.getBoundingClientRect()
  if (t.top < c.top) container.scrollTop += t.top - c.top
  else if (t.bottom > c.bottom) container.scrollTop += t.bottom - c.bottom
  if (t.left < c.left) container.scrollLeft += t.left - c.left
  else if (t.right > c.right) container.scrollLeft += t.right - c.right
}

/**
 * Consume a click on a same-document hash link inside a card body.
 * Prevents the document from scrolling another window that reused the same id.
 * @param event - the click.
 * @param body - that card's body root (`event.currentTarget` when bound there).
 * @returns true when the click was a local hash link and default was cancelled.
 */
export function consumeCardHashClick(event: MouseEvent, body: ParentNode): boolean {
  const target = event.target
  if (!(target instanceof Element)) return false
  const anchor = target.closest('a[href]')
  if (!(anchor instanceof HTMLAnchorElement)) return false
  if (!body.contains(anchor)) return false
  const href = anchor.getAttribute('href')
  if (href === null || !href.startsWith('#')) return false
  event.preventDefault()
  const found = resolveCardHashTarget(body, href)
  if (found instanceof HTMLElement && body instanceof HTMLElement) {
    scrollNearestWithin(nearestScrollport(body, found), found)
  }
  return true
}
