/** Build Cursor CLI argv for one long-lived interactive PTY session. */

const STRIP_FLAG_PREFIXES = [
  '--print',
  '-p',
  '--output-format',
  '--stream-partial-output',
  '--force',
  '-f',
  '--yolo',
  '--resume',
] as const

/**
 * Strip headless/print flags from configured `agentArgs` so the interactive
 * TUI can draw option surfaces (slash menus, trust, approvals).
 * @param programArgs - argv from {@link resolveAgentArgv}.
 * @returns args safe to place after the program file for a PTY session.
 */
export function buildInteractiveArgs(programArgs: readonly string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < programArgs.length; i += 1) {
    const arg = programArgs[i]!
    if (arg === '--output-format' || arg === '--resume' || arg === '--model' || arg === '--mode') {
      i += 1
      continue
    }
    if (arg === '--sandbox') {
      // Keep sandbox value when present: `--sandbox enabled`.
      const next = programArgs[i + 1]
      if (next !== undefined && !next.startsWith('-')) {
        out.push(arg, next)
        i += 1
        continue
      }
    }
    if (STRIP_FLAG_PREFIXES.some(flag => arg === flag || arg.startsWith(`${flag}=`))) {
      continue
    }
    if (
      arg.startsWith('--output-format=')
      || arg.startsWith('--resume=')
      || arg.startsWith('--model=')
      || arg.startsWith('--mode=')
    ) {
      continue
    }
    out.push(arg)
  }
  return out
}
