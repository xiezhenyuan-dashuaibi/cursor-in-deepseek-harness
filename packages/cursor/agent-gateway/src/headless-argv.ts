/** Build Cursor CLI argv for one headless `--print` turn. */

/** Flags this gateway always injects for stream-json chat turns. */
export const HEADLESS_PRINT_FLAGS = [
  '--print',
  '--output-format',
  'stream-json',
  '--stream-partial-output',
  '--force',
] as const

const OWNED_FLAG_PREFIXES = [
  '--print',
  '-p',
  '--output-format',
  '--stream-partial-output',
  '--force',
  '-f',
  '--resume',
] as const

/**
 * Strip gateway-owned print/resume flags from configured `agentArgs` so the
 * headless turn argv stays unambiguous.
 * @param extraArgs - cordis `agentArgs` (e.g. `--approve-mcps --trust`).
 * @returns args safe to place before the injected print flags.
 */
export function filterConfiguredAgentArgs(extraArgs: readonly string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < extraArgs.length; i += 1) {
    const arg = extraArgs[i]!
    if (arg === '--output-format') {
      i += 1
      continue
    }
    if (arg === '--resume') {
      i += 1
      continue
    }
    if (OWNED_FLAG_PREFIXES.some(flag => arg === flag || arg.startsWith(`${flag}=`))) {
      continue
    }
    out.push(arg)
  }
  return out
}

/**
 * Assemble the full argument list after the program file for one prompt turn.
 * @param programArgs - argv from {@link resolveAgentArgv} (may include `index.js`).
 * @param configuredExtra - already included in `programArgs` when resolved; pass
 *   empty when `programArgs` already embeds cordis extras.
 * @param options - resume id and the user prompt text.
 * @returns spawn args (not including the executable path).
 */
export function buildHeadlessTurnArgs(
  programArgs: readonly string[],
  options: {
    readonly resumeSessionId?: string
    readonly prompt: string
  },
): string[] {
  const args = [
    ...filterConfiguredAgentArgs(programArgs),
    ...HEADLESS_PRINT_FLAGS,
  ]
  if (options.resumeSessionId !== undefined && options.resumeSessionId.length > 0) {
    args.push('--resume', options.resumeSessionId)
  }
  args.push('--', options.prompt)
  return args
}
