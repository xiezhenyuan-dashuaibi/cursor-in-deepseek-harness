/**
 * Profile `cordis.patch.yml` Loader-row scan and `disabled` edits for
 * overlay-card occupancy. The grammar matches `overlay:live` js-yaml dump of
 * `{ id, name, disabled? }` insert rows.
 */

/** One Loader insert row as the overlay-card host reads it. */
export interface OverlayCardLoaderRow {
  /** Cordis entry id. */
  readonly id: string
  /** Package name or profile-relative specifier. */
  readonly name: string
  /** True when the row carries `disabled: true`. */
  readonly disabled: boolean
}

/**
 * Whether every recorded occupant is present and not disabled.
 * An empty occupant list is inserted (unplug is a no-op).
 * @param occupants - Loader ids on the card spec.
 * @param rows - rows scanned from the live profile patch.
 */
export function overlayCardInsertedFromOccupants(
  occupants: readonly string[],
  rows: readonly OverlayCardLoaderRow[],
): boolean {
  if (occupants.length === 0) return true
  const byId = new Map(rows.map(row => [row.id, row]))
  for (const id of occupants) {
    const row = byId.get(id)
    if (row === undefined || row.disabled) return false
  }
  return true
}

/**
 * Collect `{ id, name, disabled }` from insert rows in a profile patch.
 * @param text - `cordis.patch.yml` contents.
 */
export function scanProfileLoaderRows(text: string): OverlayCardLoaderRow[] {
  const rows: OverlayCardLoaderRow[] = []
  for (const block of loaderRowBlocks(text.split(/\n/))) {
    rows.push({
      id: block.id,
      name: block.name,
      disabled: block.disabledLine !== undefined,
    })
  }
  return rows
}

/**
 * Set `disabled: true` or delete it on the named Loader rows.
 * @param text - `cordis.patch.yml` contents.
 * @param ids - Loader ids on one card's `occupants`.
 * @param inserted - `false` writes `disabled: true`; `true` removes it.
 * @throws when an id is not a current insert row.
 */
export function setProfileLoaderRowsInserted(
  text: string,
  ids: readonly string[],
  inserted: boolean,
): string {
  let next = text
  for (const id of ids) {
    next = setOneLoaderRowInserted(next, id, inserted)
  }
  return next.endsWith('\n') ? next : `${next}\n`
}

function setOneLoaderRowInserted(text: string, id: string, inserted: boolean): string {
  const lines = text.split(/\n/)
  const block = loaderRowBlocks(lines).find(item => item.id === id)
  if (block === undefined) {
    throw new Error(`overlay-card: occupant ${JSON.stringify(id)} is not in the live patch`)
  }
  if (inserted) {
    if (block.disabledLine === undefined) return text
    const next = lines.filter((_, index) => index !== block.disabledLine)
    return next.join('\n')
  }
  if (block.disabledLine !== undefined) return text
  const insertAt = block.endLine + 1
  const disabled = `${block.keyIndent}disabled: true`
  const next = [...lines.slice(0, insertAt), disabled, ...lines.slice(insertAt)]
  return next.join('\n')
}

interface LoaderRowBlock {
  id: string
  name: string
  keyIndent: string
  endLine: number
  disabledLine: number | undefined
}

function loaderRowBlocks(lines: readonly string[]): LoaderRowBlock[] {
  const blocks: LoaderRowBlock[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line === undefined) continue
    const idMatch = /^(\s*)- id:\s*(.+?)\s*$/.exec(line)
    if (idMatch === null) continue
    const dashIndent = idMatch[1] ?? ''
    const id = yamlScalar(idMatch[2] ?? '')
    if (id.length === 0) continue
    let name = ''
    let keyIndent = `${dashIndent}  `
    let disabledLine: number | undefined
    let endLine = index
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const body = lines[cursor]
      if (body === undefined) break
      if (body.trim().length === 0) continue
      const indentMatch = /^(\s*)/.exec(body)
      const indent = indentMatch?.[1] ?? ''
      if (indent.length <= dashIndent.length) break
      if (/^\s*- /.test(body)) break
      endLine = cursor
      if (indent.length > keyIndent.length && keyIndent === `${dashIndent}  `) {
        keyIndent = indent
      }
      const nameMatch = /^\s+name:\s*(.+?)\s*$/.exec(body)
      if (nameMatch !== undefined && nameMatch !== null) {
        name = yamlScalar(nameMatch[1] ?? '')
        keyIndent = indent
      }
      if (/^\s+disabled:\s*true\s*$/.test(body)) disabledLine = cursor
    }
    blocks.push({ id, name, keyIndent, endLine, disabledLine })
  }
  return blocks
}

function yamlScalar(raw: string): string {
  const text = raw.trim()
  if (text.length >= 2) {
    const start = text[0]
    const end = text[text.length - 1]
    if ((start === "'" && end === "'") || (start === '"' && end === '"')) {
      return text.slice(1, -1)
    }
  }
  return text
}
