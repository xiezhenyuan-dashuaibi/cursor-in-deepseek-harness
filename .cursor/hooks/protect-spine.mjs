/**
 * Cursor project hook: deny Agent writes under the DSH spine.
 * DSH file sandbox does not fence Cursor's own Write/StrReplace/Shell tools.
 * Policy home: .agents/notes/implemented/process/2026-09-01-cursor-spine-write-deny.md
 */
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Repo-relative posix prefixes (and the hooks file) Agent writes must not hit. */
export const PROTECTED_PREFIXES = Object.freeze([
  'vendor/',
  'packages/core/',
  'packages/boot/',
  'native/',
  '.cursor/hooks/',
])

/** Exact repo-relative posix files protected in addition to the prefixes. */
export const PROTECTED_FILES = Object.freeze(['.cursor/hooks.json'])

const PATH_KEYS = new Set([
  'path',
  'file_path',
  'filePath',
  'target_notebook',
  'targetFile',
  'old_path',
  'new_path',
])

const WRITE_TOOLS = new Set([
  'write',
  'strreplace',
  'delete',
  'editnotebook',
  'tabwrite',
])

const READ_TOOLS = new Set(['read', 'grep', 'glob', 'semanticsearch', 'tabread'])

const MUTATION = new RegExp(
  [
    String.raw`(?:^|[&|;]\s*)(?:Set-Content|Out-File|Add-Content|Clear-Content|New-Item|Remove-Item|Move-Item|Copy-Item|Set-Item|ren(?:ame)?|del|rmdir|rd|rm|mv|cp|copy|move|mkdir|md|ni|ri|mi|tee|sed\s+-i)\b`,
    String.raw`(?:^|[^\d])>(?!>)`,
    String.raw`git\s+(?:checkout|restore|reset|clean|rm)\b`,
  ].join('|'),
  'i',
)

const TEST_OR_BUILD = /\b(?:pnpm|npm|npx|vitest|tsc|tsdown|oxlint|knip)\b/

/**
 * @param {string} rel
 * @returns {boolean}
 */
export function isProtectedRelative(rel) {
  const posix = rel.replaceAll('\\', '/').replace(/^\.\/+/, '')
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
  const absolute = isAbsolute(trimmed) ? trimmed : resolve(repoRoot, trimmed)
  const rel = relative(repoRoot, absolute)
  if (rel.startsWith(`..${sep}`) || rel === '..') return undefined
  return rel.replaceAll('\\', '/')
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
  for (const token of command.split(/[\s;&|<>]+/)) {
    if (token.includes('/') || token.includes('\\') || token.includes('packages') || token.includes('vendor')) {
      tokens.push(token)
    }
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
 * @param {Record<string, unknown>} input
 * @param {string} repoRoot
 * @returns {{ permission: 'allow' | 'deny', user_message?: string, agent_message?: string }}
 */
export function decide(input, repoRoot) {
  const toolName = typeof input.tool_name === 'string' ? input.tool_name.toLowerCase() : ''
  const topCommand = typeof input.command === 'string' ? input.command : undefined
  const toolInput = input.tool_input !== null && typeof input.tool_input === 'object'
    ? input.tool_input
    : {}
  const nestedCommand = typeof toolInput.command === 'string' ? toolInput.command : undefined
  const command = topCommand ?? nestedCommand

  if (READ_TOOLS.has(toolName) && command === undefined) {
    return { permission: 'allow' }
  }

  const paths = []
  if (typeof input.file_path === 'string') paths.push(input.file_path)
  collectPathStrings(toolInput, paths)

  const protectedHits = []
  for (const raw of paths) {
    const rel = toRepoRelative(raw, repoRoot)
    if (rel !== undefined && isProtectedRelative(rel)) protectedHits.push(rel)
  }

  if (command !== undefined) {
    if (TEST_OR_BUILD.test(command) && !commandLooksLikeMutation(command)) {
      return { permission: 'allow' }
    }
    for (const token of pathTokensFromCommand(command)) {
      const rel = toRepoRelative(token, repoRoot)
      if (rel !== undefined && isProtectedRelative(rel)) protectedHits.push(rel)
    }
    if (protectedHits.length > 0 && commandLooksLikeMutation(command)) {
      return deny(protectedHits)
    }
    if (WRITE_TOOLS.has(toolName) && protectedHits.length > 0) return deny(protectedHits)
    return { permission: 'allow' }
  }

  if (WRITE_TOOLS.has(toolName) || toolName.length === 0) {
    if (protectedHits.length > 0) return deny(protectedHits)
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
    user_message: `已拒绝写入 DSH spine（${listed}）。Cursor 文件工具不受 DSH 文件沙箱约束；请把新行为做成旁边的插件。`,
    agent_message:
      `Denied a write under the DSH spine: ${listed}. `
      + 'Do not edit vendor/, packages/core/, packages/boot/, native/, or .cursor/hooks/. '
      + 'Put new behavior in a plugin beside those trees (packages/cursor, packages/client, a bundle patch). '
      + 'The DSH file sandbox does not apply to Cursor file tools; this hook is the fence.',
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

async function main() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  let input
  try {
    input = parseHookStdin(raw)
  } catch {
    process.stdout.write(JSON.stringify({
      permission: 'deny',
      user_message: 'spine 保护钩子无法解析输入，已拒绝本次操作。',
      agent_message: 'The DSH spine-protection hook could not parse its JSON stdin and denied the action.',
    }))
    return
  }
  const repoRoot = typeof input.cwd === 'string' && input.cwd.length > 0
    ? resolve(input.cwd)
    : process.cwd()
  process.stdout.write(JSON.stringify(decide(input, repoRoot)))
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(resolve(entry)).href) {
  await main()
}
