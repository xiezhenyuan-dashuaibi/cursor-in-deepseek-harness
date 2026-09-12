
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repo-relative posix prefixes the Agent must not write. */
export const PROTECTED_PREFIXES = Object.freeze([
  'vendor/',
  'packages/core/',
  'packages/boot/',
  'native/',
  '.cursor/hooks/',
])

/** Exact repo-relative posix files protected in addition to the prefixes. */
export const PROTECTED_FILES = Object.freeze([
  '.cursor/hooks.json',
])

/** Cursor tool names that mutate files. Other tools with a path are reads. */
const WRITE_TOOLS = new Set([
  'Write',
  'StrReplace',
  'Delete',
  'EditNotebook',
  'ApplyPatch',
])

const PATH_KEYS = new Set([
  'path',
  'file_path',
  'filePath',
  'file',
  'target_file',
  'target_path',
  'target_notebook',
  'targetFile',
  'old_path',
  'new_path',
  'target_directory',
  'working_directory',
])

const PATH_ARRAY_KEYS = new Set(['paths', 'file_attachments', 'target_directories'])

const MUTATION = new RegExp(
  [
    String.raw`(?:^|[&|;]\s*)(?:Set-Content|Out-File|Add-Content|Clear-Content|New-Item|Remove-Item|Move-Item|Copy-Item|Set-Item|ren(?:ame)?|del|rmdir|rd|rm|mv|cp|copy|move|mkdir|md|ni|ri|mi|tee|sed\s+-i)\b`,
    String.raw`(?:^|[^\d])>(?!>)`,
    String.raw`git\s+(?:checkout|restore|reset|clean|rm)\b`,
  ].join('|'),
  'i',
)

/**
 * Walk up from this file until `.cursor/hooks.json` is a child of the directory.
 * Works both as `.cursor/hooks/protect-spine.mjs` and `.cursor/protect-spine.proposed.mjs`.
 * @param {string} start
 * @returns {string}
 */
function findRepoRoot(start) {
  let dir = start
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, '.cursor', 'hooks.json'))) return dir
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return resolve(start, '..', '..')
}

export const REPO_ROOT_FROM_HOOK = findRepoRoot(dirname(fileURLToPath(import.meta.url)))

/**
 * pnpm workspace install writes `node_modules` under protected packages.
 * Those trees are install artifacts, not spine source.
 * @param {string} posix
 * @returns {boolean}
 */
function isInstallArtifactRelative(posix) {
  return posix.split('/').includes('node_modules')
}

/**
 * @param {string} rel
 * @returns {boolean}
 */
export function isProtectedRelative(rel) {
  const posix = rel.replaceAll('\\', '/').replace(/^\.\/+/, '')
  if (isInstallArtifactRelative(posix)) return false
  if (PROTECTED_FILES.includes(posix)) return true
  return PROTECTED_PREFIXES.some(
    prefix => posix === prefix.slice(0, -1) || posix.startsWith(prefix),
  )
}

/**
 * @param {string} raw
 * @param {string} repoRoot
 * @returns {string | undefined}
 */
export function toRepoRelative(raw, repoRoot) {
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, '')
  if (trimmed.length === 0) return undefined
  const posix = trimmed.replaceAll('\\', '/')
  const absolute = isAbsolute(trimmed) ? trimmed : resolve(repoRoot, trimmed)
  const rel = relative(repoRoot, absolute)
  if (!(rel.startsWith(`..${sep}`) || rel === '..')) {
    return rel.replaceAll('\\', '/')
  }
  // Cursor hook stdin may mojibake non-ASCII workspace prefixes.
  const repoName = repoRoot.replaceAll('\\', '/').split('/').filter(Boolean).at(-1)
  if (repoName === undefined) return undefined
  const needle = `/${repoName}/`
  const idx = posix.toLowerCase().lastIndexOf(needle.toLowerCase())
  if (idx !== -1) return posix.slice(idx + needle.length)
  return undefined
}

/**
 * Cursor may send `tool_input` as an object or a JSON string.
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
export function coerceRecord(raw) {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (text.startsWith('{')) {
      try {
        const parsed = JSON.parse(text)
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed
        }
      } catch {
        return {}
      }
    }
  }
  return {}
}

/**
 * @param {unknown} value
 * @param {string[]} out
 */
function collectPathStrings(value, out) {
  if (typeof value === 'string') return
  if (Array.isArray(value)) {
    for (const item of value) collectPathStrings(item, out)
    return
  }
  if (value === null || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (PATH_KEYS.has(key) && typeof child === 'string') out.push(child)
    if (PATH_ARRAY_KEYS.has(key) && Array.isArray(child)) {
      for (const item of child) {
        if (typeof item === 'string') out.push(item)
      }
    }
    collectPathStrings(child, out)
  }
}

/**
 * @param {string} command
 * @returns {string[]}
 */
export function pathTokensFromCommand(command) {
  const tokens = []
  const quoted = command.matchAll(/['"]([^'"]+)['"]/g)
  for (const match of quoted) tokens.push(match[1] ?? '')
  for (const token of command.split(/[\s;&|<>]+/g)) {
    if (token.includes('/') || token.includes('\\')) tokens.push(token)
  }
  return tokens.filter(token => token.length > 0)
}

/**
 * @param {string} command
 * @returns {boolean}
 */
export function commandLooksLikeMutation(command) {
  return MUTATION.test(command)
}

/**
 * @param {unknown} name
 * @returns {boolean}
 */
export function isWriteTool(name) {
  return typeof name === 'string' && WRITE_TOOLS.has(name)
}

/**
 * @param {Record<string, unknown>} input
 * @param {string} repoRoot
 * @returns {{ permission: 'allow' | 'deny', user_message?: string, agent_message?: string }}
 */
export function decide(input, repoRoot) {
  const toolInput = coerceRecord(input.tool_input ?? input.arguments)
  const topCommand = typeof input.command === 'string' ? input.command : undefined
  const nestedCommand = typeof toolInput.command === 'string' ? toolInput.command : undefined
  const command = topCommand ?? nestedCommand

  const paths = []
  if (typeof input.file_path === 'string') paths.push(input.file_path)
  collectPathStrings(toolInput, paths)

  const protectedHits = []
  for (const raw of paths) {
    const rel = toRepoRelative(raw, repoRoot)
    if (rel !== undefined && isProtectedRelative(rel)) protectedHits.push(rel)
  }

  if (command !== undefined) {
    for (const token of pathTokensFromCommand(command)) {
      const rel = toRepoRelative(token, repoRoot)
      if (rel !== undefined && isProtectedRelative(rel)) protectedHits.push(rel)
    }
  }

  if (protectedHits.length > 0 && isWriteTool(input.tool_name)) {
    return deny(protectedHits)
  }
  if (command !== undefined && protectedHits.length > 0 && commandLooksLikeMutation(command)) {
    return deny(protectedHits)
  }
  return { permission: 'allow' }
}

/**
 * @param {string[]} hits
 */
function deny(hits) {
  const listed = [...new Set(hits)].join(', ')
  return {
    permission: 'deny',
    user_message: `已拒绝写入 spine（${listed}）。读取、搜索与非变异 shell 仍允许。`,
    agent_message:
      `Denied write under ${listed}. `
      + 'Reads, Grep/Glob, and non-mutating shells stay allowed. '
      + 'Do not Write, StrReplace, Delete, or run a mutating shell against '
      + 'vendor/, packages/core/, packages/boot/, native/, .cursor/hooks/, '
      + 'or .cursor/hooks.json. packages/cursor/ writes are allowed.',
  }
}

/**
 * @param {string} raw
 * @returns {Record<string, unknown>}
 */
export function parseHookStdin(raw) {
  const text = raw.replace(/^\uFEFF/, '').trim()
  if (text.length === 0) return {}
  const parsed = JSON.parse(text)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SyntaxError('hook stdin must be a JSON object')
  }
  return parsed
}

async function readStdinObject() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
    const text = Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '').trim()
    if (text.length === 0) continue
    try {
      const parsed = JSON.parse(text)
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed
      }
    } catch {
      // incomplete JSON
    }
  }
  return parseHookStdin(Buffer.concat(chunks).toString('utf8'))
}

async function main() {
  try {
    const input = await readStdinObject()
    try {
      writeFileSync(
        resolve(REPO_ROOT_FROM_HOOK, '.cursor/protect-spine.last-stdin.json'),
        JSON.stringify(input, null, 2),
      )
    } catch {
      // dump is best-effort
    }
    const result = decide(input, REPO_ROOT_FROM_HOOK)
    process.stdout.write(JSON.stringify(result))
    if (result.permission === 'deny') process.exit(2)
  } catch {
    process.stdout.write(JSON.stringify({ permission: 'allow' }))
  }
}

if (process.argv.some(a => /(?:^|[\\/])protect-spine(?:\.proposed)?\.mjs$/i.test(a))) {
  await main()
}
