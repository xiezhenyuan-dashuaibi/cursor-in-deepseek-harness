/**
 * Shared model-facing skill catalog entry formatting.
 * Native pre-step messages and the Cursor MCP extra-tool projection both
 * publish these lines so name and description stay byte-aligned.
 */

import { escapeText } from '@deepseek-ai/dsh-skill'

/** Default `catalogDescriptionMaxLength`; the ellipsis needs three characters. */
export const DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH = 500

/** One catalog row: kebab-case name plus normalized, unescaped description. */
export interface SkillCatalogEntry {
  readonly name: string
  readonly description: string
}

/** Opening sentence of a non-empty available-skills list. */
export const SKILL_CATALOG_INTRO =
  'A skill is a reusable set of task-specific instructions. The following skills are available in this session:'

/**
 * How to load from a published catalog. Native conversation injection appends
 * a user-gesture sentence after this; MCP does not, because that injection
 * never runs on the Cursor conversation.
 */
export const SKILL_CATALOG_LOAD_GUIDANCE =
  "If the user names a skill, or the task clearly matches a skill's description, call the `dsh_skill` tool with the exact skill name before taking task actions. Load all applicable skills, then follow their full instructions. This catalog contains summaries only; do not infer or follow a skill's instructions until it has been loaded."

/** Empty catalog: no `dsh_skill` names are valid from an earlier list. */
export const SKILL_CATALOG_EMPTY =
  'No skills are currently available through the `dsh_skill` tool. Do not use names from earlier skill catalogs.'

/**
 * Normalize and cap skill descriptions exactly as a published catalog stores them (unescaped).
 * @param value - provider description.
 * @param maxLength - inclusive cap; values below 3 are invalid at plugin config.
 * @returns whitespace-collapsed text, truncated with `...` when over the cap.
 */
function catalogDescription(value: string, maxLength: number): string {
  const normalized = value.replaceAll(/\s+/g, ' ').trim()
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 3)}...`
}

/**
 * Durable catalog entries from model-visible summaries.
 * @param skills - name and description pairs already filtered for model invocation.
 * @param descriptionMaxLength - cap applied after whitespace normalization.
 * @returns entries in the given order; descriptions are unescaped.
 */
export function toSkillCatalogEntries(
  skills: readonly { readonly name: string; readonly description: string }[],
  descriptionMaxLength: number = DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH,
): SkillCatalogEntry[] {
  return skills.map(skill => ({
    name: skill.name,
    description: catalogDescription(skill.description, descriptionMaxLength),
  }))
}

/**
 * Model-facing catalog lines inside `<available_skills>`.
 * XML escaping belongs to this frame, not to the published entries.
 * Names are `isSkillName`-validated and carry no escapable character.
 * @param entries - durable name and description pairs.
 * @returns one markdown list line per entry.
 */
export function renderSkillCatalogLines(entries: readonly SkillCatalogEntry[]): string[] {
  return entries.map(entry => `- \`${entry.name}\`: ${escapeText(entry.description)}`)
}
