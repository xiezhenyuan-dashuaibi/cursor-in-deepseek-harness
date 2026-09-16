/**
 * Pins shipped web-app composition: Loader ids and package.json dependencies
 * that exist in the client inventory but are absent from this bundle.
 * Product chrome (`ui-cursor-agent`, `cursor-agent-gateway`) stays.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const OMITTED_IDS = ['ui-flower-pot', 'ui-television', 'ui-overlay-desktop', 'ui-overlay-shaped'] as const
const OMITTED_PACKAGES = [
  '@deepseek-ai/dsh-client-ui-flower-pot',
  '@deepseek-ai/dsh-client-ui-television',
  '@deepseek-ai/dsh-client-ui-overlay-desktop',
  '@deepseek-ai/dsh-client-ui-overlay-shaped',
] as const

describe('web-app roster omits inventory packages absent from this bundle', () => {
  it('does not insert or depend on omitted inventory packages', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(
      readFileSync(resolve(root, 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> }
    const patch = readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8')
    const ids = [...patch.matchAll(/^\s+- id: (\S+)/gm)].map(match => match[1])

    expect(ids).toContain('ui-cursor-agent')
    expect(ids).toContain('cursor-agent-gateway')
    for (const id of OMITTED_IDS) {
      expect(ids).not.toContain(id)
    }
    for (const name of OMITTED_PACKAGES) {
      expect(patch).not.toContain(name)
      expect(manifest.dependencies).not.toHaveProperty(name)
    }
  })
})
